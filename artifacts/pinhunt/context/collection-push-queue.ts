export interface CollectionPushChange {
  status: string;
  quantity: number;
}

interface PushResult {
  error: { message: string } | null;
}

interface CollectionPushQueueOptions {
  send: (pinId: string, change: CollectionPushChange) => PromiseLike<PushResult>;
  onPendingChange: (pending: Record<string, CollectionPushChange>) => void;
  onError?: (message: string) => void;
}

function changesMatch(
  left: CollectionPushChange | undefined,
  right: CollectionPushChange,
) {
  return left?.status === right.status && left.quantity === right.quantity;
}

export function normalizeCollectionQuantities<
  T extends Record<string, { quantity?: number }>,
>(entries: T) {
  return Object.fromEntries(
    Object.entries(entries).map(([pinId, entry]) => [
      pinId,
      {
        ...entry,
        quantity: Math.max(1, Number(entry.quantity) || 1),
      },
    ]),
  ) as {
    [K in keyof T]: Omit<T[K], 'quantity'> & { quantity: number };
  };
}

export function reconcileCollectionEntry<T>(
  serverEntry: T,
  localEntry: T | undefined,
  hasPendingChange: boolean,
) {
  return hasPendingChange && localEntry ? localEntry : serverEntry;
}
/**
 * Serialises writes per pin while coalescing rapid changes to the latest value.
 * Different pins can still sync in parallel.
 */
export class CollectionPushQueue {
  private pending: Record<string, CollectionPushChange> = {};
  private active = new Map<string, Promise<void>>();
  private generation = 0;
  private readonly options: CollectionPushQueueOptions;

  constructor(options: CollectionPushQueueOptions) {
    this.options = options;
  }

  hydrate(saved: Record<string, CollectionPushChange>, flushAfterHydration = false) {
    this.pending = { ...saved, ...this.pending };
    this.notify();
    if (flushAfterHydration) this.flush();
  }

  clear() {
    this.generation += 1;
    this.pending = {};
    this.active.clear();
    this.notify();
  }

  has(pinId: string) {
    return this.pending[pinId] !== undefined;
  }

  entries() {
    return Object.entries(this.pending);
  }

  stage(pinId: string, change: CollectionPushChange) {
    this.pending[pinId] = change;
    this.notify();
  }

  enqueue(pinId: string, change: CollectionPushChange) {
    this.stage(pinId, change);
    this.drain(pinId);
  }

  flush() {
    for (const pinId of Object.keys(this.pending)) this.drain(pinId);
  }

  async waitForIdle() {
    while (this.active.size > 0) {
      await Promise.all([...this.active.values()]);
    }
  }

  private notify() {
    this.options.onPendingChange({ ...this.pending });
  }

  private drain(pinId: string) {
    if (this.active.has(pinId)) return;
    const desired = this.pending[pinId];
    if (!desired) return;
    const generation = this.generation;

    const task = (async () => {
      let failed = false;
      try {
        const { error } = await this.options.send(pinId, desired);
        if (generation !== this.generation) return;
        if (error) {
          failed = true;
          this.options.onError?.(error.message);
        } else if (changesMatch(this.pending[pinId], desired)) {
          delete this.pending[pinId];
        }
      } catch (error) {
        if (generation !== this.generation) return;
        failed = true;
        this.options.onError?.(
          error instanceof Error ? error.message : 'Collection sync failed',
        );
      } finally {
        if (generation !== this.generation) return;
        const latest = this.pending[pinId];
        this.active.delete(pinId);
        this.notify();
        // A newer value arrived while this request was in flight. Send it
        // next even if the superseded request failed; do not immediately
        // retry an unchanged failed value in a tight loop.
        if (latest && (!failed || !changesMatch(latest, desired))) {
          this.drain(pinId);
        }
      }
    })();

    this.active.set(pinId, task);
  }
}

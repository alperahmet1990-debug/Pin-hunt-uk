export interface CollectionPushChange {
  status: string;
  quantity: number;
}

interface PushResult {
  error: { message: string } | null;
}

interface PushQueueOptions<C> {
  send: (key: string, change: C) => PromiseLike<PushResult>;
  onPendingChange: (pending: Record<string, C>) => void;
  onError?: (message: string) => void;
  /** Whether a pending change is the same one that was sent. */
  isSame: (pending: C | undefined, sent: C) => boolean;
}

type CollectionPushQueueOptions = Omit<PushQueueOptions<CollectionPushChange>, 'isSame'>;

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
 * Serialises writes per key while coalescing rapid changes to the latest
 * value. Different keys can still sync in parallel. Used for collection pins
 * (CollectionPushQueue) and boards (BoardsContext).
 */
export class PushQueue<C> {
  private pending: Record<string, C> = {};
  private active = new Map<string, Promise<void>>();
  private generation = 0;
  private readonly options: PushQueueOptions<C>;

  constructor(options: PushQueueOptions<C>) {
    this.options = options;
  }

  hydrate(saved: Record<string, C>, flushAfterHydration = false) {
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

  stage(pinId: string, change: C) {
    this.pending[pinId] = change;
    this.notify();
  }

  enqueue(pinId: string, change: C) {
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
        } else if (this.options.isSame(this.pending[pinId], desired)) {
          delete this.pending[pinId];
        }
      } catch (error) {
        if (generation !== this.generation) return;
        failed = true;
        this.options.onError?.(
          error instanceof Error ? error.message : 'Sync failed',
        );
      } finally {
        if (generation !== this.generation) return;
        const latest = this.pending[pinId];
        this.active.delete(pinId);
        this.notify();
        // A newer value arrived while this request was in flight. Send it
        // next even if the superseded request failed; do not immediately
        // retry an unchanged failed value in a tight loop.
        if (latest && (!failed || !this.options.isSame(latest, desired))) {
          this.drain(pinId);
        }
      }
    })();

    this.active.set(pinId, task);
  }
}

/** Collection pin status/quantity writes. */
export class CollectionPushQueue extends PushQueue<CollectionPushChange> {
  constructor(options: CollectionPushQueueOptions) {
    super({ ...options, isSame: changesMatch });
  }
}

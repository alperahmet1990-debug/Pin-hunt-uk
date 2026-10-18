/**
 * Usage and budget persistence for the Soldgraph client.
 *
 * The interface is stable. SupabaseUsageStore (supabase-usage-store.ts,
 * provider_usage and provider_budgets from migration 049, #404) implements it
 * and must be used before Soldgraph is enabled anywhere: the in-memory store
 * below resets on restart and is for tests only.
 */

export type SoldgraphUsageStatus = "complete" | "failed" | "timeout" | "unavailable" | "error";

export interface SoldgraphUsageRecord {
  provider: "soldgraph";
  route: string;
  requestId: string | null;
  idempotencyKey: string;
  status: SoldgraphUsageStatus;
  credits: number;
  pinId?: string;
  /** ISO timestamp from the client's clock; stores derive the UTC month from it. */
  occurredAt?: string;
}

export interface SoldgraphMonthUsage {
  credits: number;
  requests: number;
}

export interface SoldgraphBudget {
  limitCredits: number;
  hardStop: boolean;
}

export interface SoldgraphReserveRequest {
  provider: "soldgraph";
  /** UTC "YYYY-MM". */
  month: string;
  route: string;
  /** The same key is later passed to recordUsage, which settles the reservation. */
  idempotencyKey: string;
  credits: number;
  pinId?: string;
  occurredAt: string;
  /** Applied when the month has no budget row. */
  defaultBudget: SoldgraphBudget;
}

export interface SoldgraphReservation {
  allowed: boolean;
  /** Credits used in the month before this reservation. */
  usedCredits: number;
  limitCredits: number;
  hardStop: boolean;
}

export interface UsageStore {
  /**
   * Settles the usage of one call. When reserveCredit reserved credits under
   * the same idempotencyKey, this replaces the reservation with the outcome.
   */
  recordUsage(record: SoldgraphUsageRecord): Promise<void>;
  /**
   * Optional: check the month's budget and reserve credits in one atomic step.
   * When present the client uses it instead of getMonthUsage + getBudget, so
   * parallel searches cannot go over the cap.
   */
  reserveCredit?(request: SoldgraphReserveRequest): Promise<SoldgraphReservation>;
  /** month is a UTC "YYYY-MM" string. */
  getMonthUsage(month: string): Promise<SoldgraphMonthUsage>;
  /** null when the month has no budget row; the client then applies its default (100 credits, hard stop). */
  getBudget(month: string): Promise<SoldgraphBudget | null>;
}

export function monthOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

export class InMemoryUsageStore implements UsageStore {
  readonly records: SoldgraphUsageRecord[] = [];
  private budgets = new Map<string, SoldgraphBudget>();

  constructor(
    private readonly now: () => number = Date.now,
  ) {}

  setBudget(month: string, budget: SoldgraphBudget): void {
    this.budgets.set(month, budget);
  }

  async recordUsage(record: SoldgraphUsageRecord): Promise<void> {
    this.records.push({ ...record });
  }

  async getMonthUsage(month: string): Promise<SoldgraphMonthUsage> {
    let credits = 0;
    let requests = 0;
    for (const r of this.records) {
      const m = r.occurredAt ? r.occurredAt.slice(0, 7) : monthOf(this.now());
      if (m === month) {
        credits += r.credits;
        requests += 1;
      }
    }
    return { credits, requests };
  }

  async getBudget(month: string): Promise<SoldgraphBudget | null> {
    return this.budgets.get(month) ?? null;
  }
}

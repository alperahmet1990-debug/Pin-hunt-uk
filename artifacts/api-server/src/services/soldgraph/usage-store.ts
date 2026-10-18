/**
 * Usage and budget persistence for the Soldgraph client.
 *
 * The interface is stable. The Supabase-backed implementation (provider_usage
 * and provider_budgets) arrives with migration 047 (#404) and will implement
 * this same interface; until then the in-memory store below is used by tests
 * and by any caller that has no database yet.
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

export interface UsageStore {
  recordUsage(record: SoldgraphUsageRecord): Promise<void>;
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

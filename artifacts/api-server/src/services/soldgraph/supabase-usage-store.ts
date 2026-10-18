/**
 * Supabase-backed UsageStore for the Soldgraph client (#404, migration 049).
 *
 * - Usage lives in provider_usage, budgets in provider_budgets. Both tables are
 *   service-role only, so this store needs SUPABASE_SERVICE_ROLE_KEY and runs
 *   only inside the API server.
 * - reserveCredit calls reserve_provider_credit(), which checks the month's
 *   budget and inserts a 'reserved' row under one advisory lock, so parallel
 *   searches cannot go over the cap. recordUsage settles that row through
 *   record_provider_usage() (for example credits 0 for a failed job).
 * - Every failure throws. The client treats a failed budget check or
 *   reservation as "budget exceeded" (fail closed) and only logs a failed
 *   settle, which leaves the reservation counted: the cap errs safe.
 * - Errors carry no database detail, keys or request data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  SoldgraphBudget,
  SoldgraphMonthUsage,
  SoldgraphReservation,
  SoldgraphReserveRequest,
  SoldgraphUsageRecord,
  UsageStore,
} from "./usage-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export class UsageStoreError extends Error {
  constructor(public readonly operation: string) {
    super(`provider usage store: ${operation} failed`);
    this.name = "UsageStoreError";
  }
}

/** provider_usage.pin_id is a uuid: anything else is stored as NULL rather than failing the write. */
function pinUuid(pinId: string | undefined): string | null {
  return pinId && UUID_RE.test(pinId) ? pinId.toLowerCase() : null;
}

function month(m: string, op: string): string {
  if (!MONTH_RE.test(m)) throw new UsageStoreError(op);
  return m;
}

function monthFromIso(iso: string, op: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new UsageStoreError(op);
  return new Date(ms).toISOString().slice(0, 7);
}

function count(v: unknown, op: string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new UsageStoreError(op);
  return n;
}

/** PostgREST returns set-returning functions as an array; accept a single object too. */
function firstRow(data: unknown, op: string): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== "object" || row === null) throw new UsageStoreError(op);
  return row as Record<string, unknown>;
}

export class SupabaseUsageStore implements UsageStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly provider: "soldgraph" = "soldgraph",
  ) {}

  async recordUsage(record: SoldgraphUsageRecord): Promise<void> {
    const op = "record usage";
    const occurredAt = record.occurredAt ?? new Date().toISOString();
    const { error } = await this.db.rpc("record_provider_usage", {
      p_provider: this.provider,
      p_month: monthFromIso(occurredAt, op),
      p_route: record.route,
      p_idempotency_key: record.idempotencyKey,
      p_status: record.status,
      p_credits: count(record.credits, op),
      p_request_id: record.requestId,
      p_pin_id: pinUuid(record.pinId),
      p_occurred_at: occurredAt,
    });
    if (error) throw new UsageStoreError(op);
  }

  async getMonthUsage(m: string): Promise<SoldgraphMonthUsage> {
    const op = "month usage";
    const { data, error } = await this.db.rpc("get_provider_month_usage", {
      p_provider: this.provider,
      p_month: month(m, op),
    });
    if (error) throw new UsageStoreError(op);
    const row = firstRow(data, op);
    return { credits: count(row.credits, op), requests: count(row.requests, op) };
  }

  async getBudget(m: string): Promise<SoldgraphBudget | null> {
    const op = "budget";
    const { data, error } = await this.db
      .from("provider_budgets")
      .select("limit_credits, hard_stop")
      .eq("provider", this.provider)
      .eq("month", month(m, op))
      .maybeSingle();
    if (error) throw new UsageStoreError(op);
    if (data === null || data === undefined) return null;
    const row = data as { limit_credits?: unknown; hard_stop?: unknown };
    if (typeof row.hard_stop !== "boolean") throw new UsageStoreError(op);
    return { limitCredits: count(row.limit_credits, op), hardStop: row.hard_stop };
  }

  async reserveCredit(request: SoldgraphReserveRequest): Promise<SoldgraphReservation> {
    const op = "reserve credit";
    const { data, error } = await this.db.rpc("reserve_provider_credit", {
      p_provider: this.provider,
      p_month: month(request.month, op),
      p_route: request.route,
      p_idempotency_key: request.idempotencyKey,
      p_credits: count(request.credits, op),
      p_pin_id: pinUuid(request.pinId),
      p_occurred_at: request.occurredAt,
      p_default_limit: count(request.defaultBudget.limitCredits, op),
      p_default_hard_stop: request.defaultBudget.hardStop,
    });
    if (error) throw new UsageStoreError(op);
    const row = firstRow(data, op);
    if (typeof row.allowed !== "boolean" || typeof row.hard_stop !== "boolean") throw new UsageStoreError(op);
    return {
      allowed: row.allowed,
      usedCredits: count(row.used_credits, op),
      limitCredits: count(row.limit_credits, op),
      hardStop: row.hard_stop,
    };
  }
}

/**
 * The store for the running server, or null when SUPABASE_URL or
 * SUPABASE_SERVICE_ROLE_KEY is missing. Soldgraph must not be enabled without
 * it: callers should refuse to build a client rather than fall back to the
 * in-memory store.
 */
export function createSupabaseUsageStoreFromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseUsageStore | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return new SupabaseUsageStore(
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
}

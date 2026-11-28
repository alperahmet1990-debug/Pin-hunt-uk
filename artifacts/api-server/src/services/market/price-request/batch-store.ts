/**
 * Supabase implementation of BatchStore. Service role only (the batch script
 * runs behind the staging guard). Errors are generic: operation name only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRefreshStore } from "../refresh/store";
import type { BatchPin, BatchStore } from "./batch";

export class BatchStoreError extends Error {
  constructor(public readonly operation: string) {
    super(`price batch: ${operation} failed`);
    this.name = "BatchStoreError";
  }
}

const PAGE = 1000;
const IN_CHUNK = 100;
/** Upper bound on collection rows read to rank the most collected pins. */
const MAX_COLLECTION_ROWS = 500_000;
type Row = Record<string, unknown>;
const chunk = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export class SupabaseBatchStore implements BatchStore {
  private readonly refresh: SupabaseRefreshStore;

  constructor(private readonly db: SupabaseClient, env: NodeJS.ProcessEnv = process.env) {
    this.refresh = new SupabaseRefreshStore(db, env);
  }

  async listPins(q: { years: number[]; pinhuntIds: string[] | null; offset: number; limit: number | null }): Promise<BatchPin[]> {
    const all: BatchPin[] = [];
    const push = (rows: Row[]) => {
      for (const r of rows) if (typeof r.id === "string" && typeof r.pinhunt_id === "string") all.push({ uuid: r.id, pinhuntId: r.pinhunt_id });
    };
    if (q.pinhuntIds) {
      for (const part of chunk(q.pinhuntIds, IN_CHUNK)) {
        // The same filters as the year query: never an archived or unverified pin.
        const { data, error } = await this.db
          .from("pins")
          .select("id, pinhunt_id")
          .in("pinhunt_id", part)
          .eq("verification_status", "verified")
          .neq("catalogue_status", "archived");
        if (error) throw new BatchStoreError("list pins");
        push((data ?? []) as Row[]);
      }
      // Keep the file's order, so a ranked list is priced top first.
      const rank = new Map(q.pinhuntIds.map((id, i) => [id, i]));
      all.sort((a, b) => (rank.get(a.pinhuntId) ?? 0) - (rank.get(b.pinhuntId) ?? 0));
    } else {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.db
          .from("pins")
          .select("id, pinhunt_id")
          .in("release_year", q.years)
          .eq("verification_status", "verified")
          .neq("catalogue_status", "archived")
          .order("pinhunt_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new BatchStoreError("list pins");
        const rows = (data ?? []) as Row[];
        push(rows);
        if (rows.length < PAGE) break;
      }
    }
    const end = q.limit === null ? undefined : q.offset + q.limit;
    return all.slice(q.offset, end);
  }

  /**
   * The most collected pins, most first: owned, for-trade and ISO entries per
   * pin, counted over user_pins (service role, counts only, never who). Only
   * verified, non-archived pins. Ties keep the PinHunt ID order.
   */
  async popularPinhuntIds(count: number): Promise<string[]> {
    const tally = new Map<string, number>();
    for (let from = 0; from < MAX_COLLECTION_ROWS; from += PAGE) {
      const { data, error } = await this.db
        .from("user_pins")
        .select("pin_id")
        .in("status", ["owned", "for_trade", "wanted"])
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new BatchStoreError("count collections");
      const rows = (data ?? []) as Row[];
      for (const r of rows) if (typeof r.pin_id === "string") tally.set(r.pin_id, (tally.get(r.pin_id) ?? 0) + 1);
      if (rows.length < PAGE) break;
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const byUuid = new Map<string, string>();
    // Read a little past `count`, since some of the top pins may be unverified or archived.
    for (const part of chunk(ranked.slice(0, Math.max(count * 2, count + 50)), IN_CHUNK)) {
      const { data, error } = await this.db
        .from("pins")
        .select("id, pinhunt_id")
        .in("id", part)
        .eq("verification_status", "verified")
        .neq("catalogue_status", "archived");
      if (error) throw new BatchStoreError("list pins");
      for (const r of (data ?? []) as Row[]) if (typeof r.id === "string" && typeof r.pinhunt_id === "string") byUuid.set(r.id, r.pinhunt_id);
    }
    const rank = new Map(ranked.map((id, i) => [id, i]));
    return [...byUuid.entries()]
      .sort((a, b) => (rank.get(a[0])! - rank.get(b[0])!) || a[1].localeCompare(b[1]))
      .slice(0, count)
      .map(([, pinhuntId]) => pinhuntId);
  }

  async recentlyAnswered(pinUuids: string[], sources: string[], sinceIso: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (const part of chunk(pinUuids, IN_CHUNK)) {
      const { data, error } = await this.db
        .from("market_price_requests")
        .select("pin_id, sources")
        .in("pin_id", part)
        .eq("status", "complete")
        .gt("finished_at", sinceIso);
      if (error) throw new BatchStoreError("read request log");
      for (const r of (data ?? []) as Row[]) {
        const s = Array.isArray(r.sources) ? r.sources : [];
        if (typeof r.pin_id === "string" && sources.every(x => s.includes(x))) out.add(r.pin_id);
      }
    }
    return out;
  }

  async budget(month: string) {
    const b = await this.refresh.budget(month);
    return { usedCredits: b.usedCredits, limitCredits: b.limitCredits, hardStop: b.hardStop };
  }
}

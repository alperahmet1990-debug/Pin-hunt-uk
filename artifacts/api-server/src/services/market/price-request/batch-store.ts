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

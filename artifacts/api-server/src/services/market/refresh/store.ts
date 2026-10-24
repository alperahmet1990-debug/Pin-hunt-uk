/**
 * Supabase implementation of RefreshStore (SG-06, #409). Service role only:
 * market_listings, provider_usage and provider_budgets have no client grants
 * (049). The script builds the client only after the staging guard passes.
 *
 * Errors are generic (operation name only): no database detail, keys or rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabasePinRepository } from "@workspace/pin-repository";
import { defaultSoldgraphBudget } from "../../soldgraph/client";
import { SupabaseUsageStore } from "../../soldgraph/supabase-usage-store";
import type { EvidenceType, Market } from "../adapter";
import { revaluePinFromStoredEvidence } from "../valuation-v2-service";
import type {
  BudgetStatus,
  ExpiredCount,
  ListingKey,
  MarketListingRow,
  PinRef,
  RefreshStore,
  SourceRow,
  StoredAcceptedListing,
  UsageReportRow,
} from "./types";

export class RefreshStoreError extends Error {
  constructor(public readonly operation: string) {
    super(`market refresh: ${operation} failed`);
    this.name = "RefreshStoreError";
  }
}

const PAGE = 1000;
const IN_CHUNK = 100;
const PROVIDER = "soldgraph";
const MARKETS = new Set(["UK", "FR", "US"]);

const chunk = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

type Row = Record<string, unknown>;
interface PageQuery {
  range(from: number, to: number): PromiseLike<{ data: unknown; error: unknown }>;
}

async function allPages(op: string, make: () => PageQuery): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new RefreshStoreError(op);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export class SupabaseRefreshStore implements RefreshStore {
  private readonly usage: SupabaseUsageStore;

  constructor(
    private readonly db: SupabaseClient,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.usage = new SupabaseUsageStore(db, PROVIDER);
  }

  async loadSources(): Promise<SourceRow[]> {
    const { data, error } = await this.db
      .from("market_sources")
      .select("id, provider, market, evidence_type, enabled, retention_days");
    if (error) throw new RefreshStoreError("load sources");
    const out: SourceRow[] = [];
    for (const r of (data ?? []) as Row[]) {
      if (typeof r.id !== "string" || !MARKETS.has(String(r.market))) continue;
      if (r.evidence_type !== "sold" && r.evidence_type !== "active") continue;
      const retention = num(r.retention_days);
      out.push({
        id: r.id,
        provider: String(r.provider ?? ""),
        market: r.market as Market,
        evidenceType: r.evidence_type as EvidenceType,
        enabled: r.enabled === true,
        retentionDays: retention !== null && retention >= 1 ? retention : 30,
      });
    }
    return out;
  }

  async loadPins(pinhuntIds: string[]): Promise<PinRef[]> {
    if (pinhuntIds.length === 0) return [];
    const uuids = new Map<string, string>();
    for (const part of chunk(pinhuntIds, IN_CHUNK)) {
      const { data, error } = await this.db.from("pins").select("id, pinhunt_id").in("pinhunt_id", part);
      if (error) throw new RefreshStoreError("load pin ids");
      for (const r of (data ?? []) as Row[]) {
        if (typeof r.id === "string" && typeof r.pinhunt_id === "string") uuids.set(r.pinhunt_id, r.id);
      }
    }
    let pins;
    try {
      pins = await createSupabasePinRepository(this.db as never).getPinsByIds(pinhuntIds);
    } catch {
      throw new RefreshStoreError("load pins");
    }
    const out: PinRef[] = [];
    for (const pin of pins) {
      const uuid = uuids.get(pin.id);
      if (uuid) out.push({ uuid, pinhuntId: pin.id, pin });
    }
    return out;
  }

  async lastSeen(
    pinUuids: string[],
    sourceIds: string[],
    now: number,
    locationFilters?: ReadonlyMap<string, string | null>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (pinUuids.length === 0 || sourceIds.length === 0) return out;
    const nowIso = new Date(now).toISOString();
    for (const part of chunk(pinUuids, IN_CHUNK)) {
      const rows = await allPages("load cache", () =>
        this.db
          .from("market_listings")
          .select("pin_id, source_id, last_seen_at, location_filter")
          .in("pin_id", part)
          .in("source_id", sourceIds)
          .gt("expires_at", nowIso)
          .order("id"));
      for (const r of rows) {
        if (typeof r.last_seen_at !== "string") continue;
        const source = String(r.source_id);
        if (locationFilters?.has(source) && (r.location_filter ?? null) !== locationFilters.get(source)) continue;
        const key = `${String(r.pin_id)}|${String(r.source_id)}`;
        const prev = out.get(key);
        if (!prev || Date.parse(r.last_seen_at) > Date.parse(prev)) out.set(key, r.last_seen_at);
      }
    }
    return out;
  }

  async acceptedFor(pairs: Array<{ sourceId: string; externalId: string }>): Promise<StoredAcceptedListing[]> {
    const bySource = new Map<string, string[]>();
    for (const p of pairs) bySource.set(p.sourceId, [...(bySource.get(p.sourceId) ?? []), p.externalId]);
    const out: StoredAcceptedListing[] = [];
    for (const [sourceId, ids] of bySource) {
      for (const part of chunk(ids, IN_CHUNK)) {
        const rows = await allPages("load duplicates", () =>
          this.db
            .from("market_listings")
            .select("pin_id, source_id, external_id, match_score")
            .eq("source_id", sourceId)
            .in("external_id", part)
            .eq("accepted", true)
            .order("id"));
        for (const r of rows) {
          out.push({
            pinUuid: String(r.pin_id),
            sourceId: String(r.source_id),
            externalId: String(r.external_id),
            matchScore: num(r.match_score),
          });
        }
      }
    }
    return out;
  }

  async upsertListings(rows: MarketListingRow[]): Promise<void> {
    if (rows.length === 0) return;
    // first_seen_at is left out, so an update keeps the original value.
    const { error } = await this.db
      .from("market_listings")
      .upsert(rows, { onConflict: "source_id,external_id,pin_id" });
    if (error) throw new RefreshStoreError("save listings");
  }

  async deleteListings(keys: ListingKey[]): Promise<void> {
    for (const k of keys) {
      const { error } = await this.db
        .from("market_listings")
        .delete()
        .eq("pin_id", k.pinUuid)
        .eq("source_id", k.sourceId)
        .eq("external_id", k.externalId);
      if (error) throw new RefreshStoreError("remove duplicate listing");
    }
  }

  async budget(month: string): Promise<BudgetStatus> {
    let usage;
    let row;
    try {
      [usage, row] = await Promise.all([this.usage.getMonthUsage(month), this.usage.getBudget(month)]);
    } catch {
      throw new RefreshStoreError("read budget");
    }
    const effective = row ?? defaultSoldgraphBudget(this.env);
    return {
      month,
      usedCredits: usage.credits,
      requests: usage.requests,
      limitCredits: effective.limitCredits,
      hardStop: effective.hardStop,
      origin: row ? "row" : "default",
    };
  }

  async countExpired(sourceId: string | null, now: number): Promise<ExpiredCount[]> {
    const sources = (await this.loadSources()).filter(s => sourceId === null || s.id === sourceId);
    const nowIso = new Date(now).toISOString();
    const out: ExpiredCount[] = [];
    for (const s of sources) {
      // The same rule as purge_market_listings(): expired, or older than the
      // source's (possibly shortened) retention.
      const cutoff = new Date(now - s.retentionDays * 86_400_000).toISOString();
      const { count, error } = await this.db
        .from("market_listings")
        .select("id", { count: "exact", head: true })
        .eq("source_id", s.id)
        .or(`expires_at.lte.${nowIso},last_seen_at.lte.${cutoff}`);
      if (error) throw new RefreshStoreError("count expired listings");
      out.push({ sourceId: s.id, count: count ?? 0 });
    }
    return out;
  }

  async purgeExpired(sourceId: string | null): Promise<number> {
    const { data, error } = await this.db.rpc("purge_market_listings", { p_source_id: sourceId, p_all: false });
    if (error) throw new RefreshStoreError("purge expired listings");
    const n = num(data);
    return n ?? 0;
  }

  async usageRows(fromMonth: string): Promise<UsageReportRow[]> {
    const rows = await allPages("read usage", () =>
      this.db
        .from("provider_usage")
        .select("usage_month, route, status, credits")
        .eq("provider", PROVIDER)
        .gte("usage_month", fromMonth)
        .order("id"));
    return rows.map(r => ({
      month: String(r.usage_month),
      route: String(r.route),
      status: String(r.status),
      credits: num(r.credits) ?? 0,
    }));
  }

  async budgets(fromMonth: string): Promise<Array<{ month: string; limitCredits: number; hardStop: boolean }>> {
    const { data, error } = await this.db
      .from("provider_budgets")
      .select("month, limit_credits, hard_stop")
      .eq("provider", PROVIDER)
      .gte("month", fromMonth);
    if (error) throw new RefreshStoreError("read budgets");
    return ((data ?? []) as Row[]).map(r => ({
      month: String(r.month),
      limitCredits: num(r.limit_credits) ?? 0,
      hardStop: r.hard_stop !== false,
    }));
  }

  revalue(pinUuid: string, now: number) {
    return revaluePinFromStoredEvidence(this.db, pinUuid, { now, env: this.env });
  }
}

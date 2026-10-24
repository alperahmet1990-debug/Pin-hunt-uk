/**
 * Read-only database access for marketplace leads (SG-10, #415). Service
 * role, staging only (the script passes the staging guard before it builds
 * the client). Nothing here inserts, updates or deletes.
 *
 * market_listings is read for near misses only (accepted = false, a
 * near-miss rejection_reason, not expired; rows of a source with no
 * age-based expiry have no expires_at and always count). The listing link column is never
 * selected. Errors are generic (operation name only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabasePinRepository, type PinSetSummary } from "@workspace/pin-repository";
import { NEAR_MISS_REASONS } from "../refresh/refresh";
import type { CatalogueEntry, LeadListing, LeadSource } from "./leads";

/** Third-party titles are cut to this length before parsing. */
export const MAX_TITLE_LENGTH = 300;

export class LeadsStoreError extends Error {
  constructor(public readonly operation: string) {
    super(`marketplace leads: ${operation} failed`);
    this.name = "LeadsStoreError";
  }
}

export interface LeadsStore {
  loadSources(): Promise<LeadSource[]>;
  /** Unexpired near-miss rows last seen at or after `sinceIso`, optionally for some sources. */
  loadNearMisses(sinceIso: string, nowIso: string, sourceIds: string[] | null): Promise<LeadListing[]>;
  /** Every non-archived catalogue pin. */
  loadCatalogue(): Promise<CatalogueEntry[]>;
  /** The pins listings were stored against, keyed by pins.id (UUID). Archived pins included. */
  loadAnchors(pinUuids: string[]): Promise<Map<string, CatalogueEntry>>;
  loadSets(): Promise<PinSetSummary[]>;
}

const PAGE = 1000;
const IN_CHUNK = 100;
/** A safety stop for the catalogue read, far above the live catalogue's size. */
const MAX_CATALOGUE = 100_000;
const LISTING_COLUMNS =
  "source_id, external_id, pin_id, title, price, currency, sold_date, last_seen_at, rejection_reason, match_score";

type Row = Record<string, unknown>;

const chunk = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Maps a market_listings row; null when a required column is missing. */
export function toLeadListing(r: Row): LeadListing | null {
  const sourceId = str(r.source_id);
  const externalId = str(r.external_id);
  const pinUuid = str(r.pin_id);
  const title = str(r.title);
  const lastSeenAt = str(r.last_seen_at);
  const currency = str(r.currency);
  if (!sourceId || !externalId || !pinUuid || !title || !lastSeenAt || !currency) return null;
  return {
    sourceId,
    externalId,
    pinUuid,
    title: title.slice(0, MAX_TITLE_LENGTH),
    price: num(r.price),
    currency,
    soldDate: str(r.sold_date),
    lastSeenAt,
    rejectionReason: str(r.rejection_reason),
    matchScore: num(r.match_score),
  };
}

export class SupabaseLeadsStore implements LeadsStore {
  constructor(private readonly db: SupabaseClient) {}

  async loadSources(): Promise<LeadSource[]> {
    const { data, error } = await this.db.from("market_sources").select("id, marketplace, market");
    if (error) throw new LeadsStoreError("load sources");
    return ((data ?? []) as Row[])
      .filter(r => typeof r.id === "string")
      .map(r => ({ id: String(r.id), marketplace: String(r.marketplace ?? ""), market: String(r.market ?? "") }));
  }

  async loadNearMisses(sinceIso: string, nowIso: string, sourceIds: string[] | null): Promise<LeadListing[]> {
    const out: LeadListing[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.db
        .from("market_listings")
        .select(LISTING_COLUMNS)
        .eq("accepted", false)
        .in("rejection_reason", [...NEAR_MISS_REASONS])
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .gte("last_seen_at", sinceIso);
      if (sourceIds) q = q.in("source_id", sourceIds);
      const { data, error } = await q.order("id").range(from, from + PAGE - 1);
      if (error) throw new LeadsStoreError("load near misses");
      const rows = (data ?? []) as Row[];
      for (const r of rows) {
        const l = toLeadListing(r);
        if (l) out.push(l);
      }
      if (rows.length < PAGE) return out;
    }
  }

  async loadCatalogue(): Promise<CatalogueEntry[]> {
    const repo = createSupabasePinRepository(this.db as never);
    const out: CatalogueEntry[] = [];
    try {
      for (let offset = 0; offset < MAX_CATALOGUE; offset += PAGE) {
        const { pins } = await repo.searchPinsPage("", { limit: PAGE, offset });
        for (const pin of pins) out.push({ pinhuntId: pin.id, pin });
        if (pins.length < PAGE) break;
      }
    } catch {
      throw new LeadsStoreError("load catalogue");
    }
    return out;
  }

  async loadAnchors(pinUuids: string[]): Promise<Map<string, CatalogueEntry>> {
    const out = new Map<string, CatalogueEntry>();
    const ids = [...new Set(pinUuids)];
    const byPinhunt = new Map<string, string>();
    for (const part of chunk(ids, IN_CHUNK)) {
      const { data, error } = await this.db.from("pins").select("id, pinhunt_id").in("id", part);
      if (error) throw new LeadsStoreError("load pin ids");
      for (const r of (data ?? []) as Row[]) {
        if (typeof r.id === "string" && typeof r.pinhunt_id === "string") byPinhunt.set(r.pinhunt_id, r.id);
      }
    }
    if (byPinhunt.size === 0) return out;
    let pins;
    try {
      pins = await createSupabasePinRepository(this.db as never).getPinsByIds([...byPinhunt.keys()]);
    } catch {
      throw new LeadsStoreError("load pins");
    }
    for (const pin of pins) {
      const uuid = byPinhunt.get(pin.id);
      if (uuid) out.set(uuid, { pinhuntId: pin.id, pin });
    }
    return out;
  }

  async loadSets(): Promise<PinSetSummary[]> {
    try {
      return await createSupabasePinRepository(this.db as never).getSetSummaries();
    } catch {
      throw new LeadsStoreError("load sets");
    }
  }
}

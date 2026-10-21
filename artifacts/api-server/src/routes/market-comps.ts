/**
 * Comparable sold listings (SG-12, #446).
 *
 * GET /api/pins/:pinId/market-comps?market=UK&limit=20
 *   - Behind MARKET_COMPS_PUBLIC_ENABLED (default off). Off = 404 for
 *     everyone, checked before anything else. It is a separate switch from
 *     MARKET_VALUATION_V2_ENABLED: enabling valuations never enables this.
 *     It stays off until marketplace terms are resolved for the source shown
 *     (docs/market-data/RIGHTS.md §2–3).
 *   - Signed-in users only (401 otherwise).
 *   - `market` must be in MARKET_VALUATION_PUBLISHED_MARKETS (404 otherwise).
 *   - Rows: accepted, priced, sold (not Best Offer, and not "possibly Best
 *     Offer"), sold within the last 365 days, from an enabled sold source of
 *     that market, and region-verified (054, #450: fetched with the domestic
 *     filter, not a converted price, item country matching the market when
 *     known, and not the same item counted in another market).
 *   - Fields: sold date, sold price, currency, marketplace, source id,
 *     provider, and a link reduced to https on the marketplace's own website
 *     for that market with no query string (or null). Never titles, images,
 *     sellers, locations or item ids. Each comp names its own source:
 *     Soldgraph eBay data and eBay Browse API data are never merged.
 *
 * market_listings has no client grants (049), so rows are read with the
 * service role, after the caller's token has been checked and the pin
 * resolved as the caller sees it (RLS). Read-only.
 */
import { Router, type IRouter } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MarketCode } from "@workspace/pin-repository";
import { PIN_ID_RE, requireUser, userClient, type AuthedRequest } from "./market-valuations";
import { compsPublicEnabled, isMarketPublished, sanitiseListingLink } from "../services/market/publication";
import { MARKET_CURRENCY, VALUATION_V2_CONFIG, providerOf, regionExclusions, type ValuationEvidence } from "../services/market/valuation-v2";

const router: IRouter = Router();

export const COMPS_DEFAULT_LIMIT = 20;
export const COMPS_MAX_LIMIT = 50;
const DAY_MS = 86_400_000;
const SOURCE_COLUMNS = "id, provider, marketplace, market, evidence_type, enabled";
const LISTING_COLUMNS =
  "source_id, external_id, price, currency, sold_date, price_kind, best_offer_accepted, listing_url, location_filter, item_country, price_is_converted";
const SOURCE_ID_RE = /^[a-z0-9_]+:[a-z0-9_]+$/;
const MARKETS = new Set<string>(["UK", "FR", "US"]);

export interface CompResponseItem {
  soldDate: string;
  price: number;
  currency: string;
  marketplace: string;
  sourceId: string;
  provider: string;
  link: string | null;
}

interface SoldSource {
  market: MarketCode;
  marketplace: string;
}

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Comps for one market from one pin's stored sold rows (all markets are
 * passed so a cross-market duplicate can be recognised). Pure.
 */
export function selectComps(
  rows: readonly Row[],
  sources: ReadonlyMap<string, SoldSource>,
  market: MarketCode,
  limit: number,
  now: number,
): CompResponseItem[] {
  const currency = MARKET_CURRENCY[market];
  const candidates: Array<{ row: Row; source: SoldSource; ev: ValuationEvidence }> = [];
  for (const r of rows) {
    const sourceId = typeof r.source_id === "string" ? r.source_id : "";
    const source = sources.get(sourceId);
    if (!source || !SOURCE_ID_RE.test(sourceId)) continue;
    candidates.push({
      row: r,
      source,
      ev: {
        sourceId,
        market: source.market,
        evidenceType: "sold",
        priceKind: r.price_kind === "sold" ? "sold" : r.price_kind === "sold_possible_offer" ? "sold_possible_offer" : "active",
        price: num(r.price),
        currency: typeof r.currency === "string" ? r.currency : "",
        soldDate: typeof r.sold_date === "string" ? r.sold_date : null,
        bestOfferAccepted: typeof r.best_offer_accepted === "boolean" ? r.best_offer_accepted : null,
        matchScore: null,
        externalId: typeof r.external_id === "string" ? r.external_id : null,
        locationFilter: typeof r.location_filter === "string" ? r.location_filter : null,
        itemCountry: typeof r.item_country === "string" ? r.item_country : null,
        priceIsConverted: typeof r.price_is_converted === "boolean" ? r.price_is_converted : null,
      },
    });
  }
  const region = regionExclusions(candidates.map(c => c.ev));
  const out: Array<CompResponseItem & { at: number }> = [];
  candidates.forEach(({ row, source, ev }, i) => {
    if (ev.market !== market || region[i] !== null) return;
    // Every comp needs region provenance, whatever its source.
    if (ev.locationFilter !== "domestic" || ev.priceIsConverted === true) return;
    if (ev.priceKind !== "sold" || ev.bestOfferAccepted === true) return;
    if (ev.currency !== currency || ev.price === null || ev.price <= 0) return;
    const at = ev.soldDate ? Date.parse(ev.soldDate) : NaN;
    if (Number.isNaN(at) || at > now || (now - at) / DAY_MS > VALUATION_V2_CONFIG.maxAgeDays) return;
    out.push({
      at,
      soldDate: new Date(at).toISOString().slice(0, 10),
      price: Math.round(ev.price * 100) / 100,
      currency,
      marketplace: source.marketplace,
      sourceId: ev.sourceId,
      provider: providerOf(ev.sourceId),
      link: sanitiseListingLink(row.listing_url, source.marketplace, market),
    });
  });
  return out
    .sort((a, b) => b.at - a.at || a.sourceId.localeCompare(b.sourceId))
    .slice(0, limit)
    .map(({ at: _at, ...item }) => item);
}

router.get(
  "/pins/:pinId/market-comps",
  (req, res, next) => {
    // Off = not found for everyone, before authentication.
    if (!compsPublicEnabled()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  },
  requireUser,
  async (req: AuthedRequest, res) => {
    const pinhuntId = String(req.params.pinId);
    if (!PIN_ID_RE.test(pinhuntId)) {
      res.status(404).json({ error: "Pin not found" });
      return;
    }
    const market = String(req.query.market ?? "").toUpperCase();
    if (!MARKETS.has(market)) {
      res.status(400).json({ error: "Invalid market" });
      return;
    }
    if (!isMarketPublished(market)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rawLimit = req.query.limit === undefined ? String(COMPS_DEFAULT_LIMIT) : String(req.query.limit);
    const limit = Number(rawLimit);
    if (!/^\d{1,3}$/.test(rawLimit) || limit < 1 || limit > COMPS_MAX_LIMIT) {
      res.status(400).json({ error: "Invalid limit" });
      return;
    }
    try {
      const { data: pin, error: pinErr } = await userClient(req.supabaseToken!)
        .from("pins")
        .select("id")
        .eq("pinhunt_id", pinhuntId)
        .maybeSingle();
      if (pinErr) throw new Error("pin lookup failed");
      if (!pin?.id) {
        res.status(404).json({ error: "Pin not found" });
        return;
      }
      const db = serviceClient();
      if (!db) throw new Error("service client not configured");

      const sourcesRes = await db.from("market_sources").select(SOURCE_COLUMNS).eq("evidence_type", "sold");
      if (sourcesRes.error) throw new Error("load sources failed");
      const sources = new Map<string, SoldSource>();
      for (const s of (sourcesRes.data ?? []) as Row[]) {
        if (s.enabled !== true || typeof s.id !== "string" || !MARKETS.has(String(s.market))) continue;
        if (s.evidence_type !== "sold" || typeof s.marketplace !== "string") continue;
        sources.set(s.id, { market: s.market as MarketCode, marketplace: s.marketplace });
      }
      const now = Date.now();
      let comps: CompResponseItem[] = [];
      if ([...sources.values()].some(s => s.market === market)) {
        const cutoff = new Date(now - VALUATION_V2_CONFIG.maxAgeDays * DAY_MS).toISOString();
        const listingsRes = await db
          .from("market_listings")
          .select(LISTING_COLUMNS)
          .eq("pin_id", String(pin.id))
          .eq("accepted", true)
          // Possibly-Best-Offer rows are read only so a cross-market duplicate is recognised; never returned.
          .in("price_kind", ["sold", "sold_possible_offer"])
          .in("source_id", [...sources.keys()])
          .gte("sold_date", cutoff)
          .order("sold_date", { ascending: false })
          .limit(1000);
        if (listingsRes.error) throw new Error("load listings failed");
        comps = selectComps((listingsRes.data ?? []) as Row[], sources, market, limit, now);
      }
      res.json({ pinId: pinhuntId, market, currency: MARKET_CURRENCY[market], comps });
    } catch (err) {
      req.log.error({ err: err instanceof Error ? err.message : "unknown" }, "market-comps read failed");
      res.status(500).json({ error: "Failed to load comparable sales" });
    }
  },
);

export default router;

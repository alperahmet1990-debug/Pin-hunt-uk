/**
 * Read access to market_valuations (migration 049, #404): one derived
 * Low/Fair/High row per (pin, market), readable by signed-in users.
 *
 * Only derived values are exposed. Raw listing evidence (market_listings),
 * provider usage and budgets are service-role only and have no client reads.
 * Values here are never written into pins.estimated_value_gbp or
 * user_pins.current_value_gbp.
 */
/**
 * The slice of a Supabase client this module uses. Structural, so a client
 * from any supabase-js version (app or API server) can be passed.
 */
export interface MarketValuationsClient {
  from(table: 'market_valuations'): {
    select(columns: string): {
      eq(column: 'pin_id', value: string): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

export type MarketCode = 'UK' | 'US' | 'FR';
export type MarketConfidenceBand = 'insufficient' | 'low' | 'medium' | 'high';

export interface MarketValuationSource {
  /** market_sources.id, e.g. "soldgraph:ebay_gb_sold". */
  sourceId: string;
  count: number;
  latestDate?: string;
}

/**
 * Derived per-source figures (migration 055, #446). One entry per source id:
 * sources are never merged. Sold sources carry latestDate and median; active
 * (asking-price) sources also low and high. No listing detail.
 */
export interface MarketValuationSourceSummary {
  sourceId: string;
  provider: string;
  evidenceType: 'sold' | 'active';
  count: number;
  latestDate?: string;
  median?: number;
  low?: number;
  high?: number;
}

export interface MarketValuation {
  /** pins.id (internal UUID). */
  pinId: string;
  market: MarketCode;
  currency: string;
  low?: number;
  fair?: number;
  high?: number;
  soldCount: number;
  activeCount: number;
  /** 0–100. */
  confidenceScore: number;
  confidenceBand: MarketConfidenceBand;
  sources: MarketValuationSource[];
  /** Present only when read with `withSummaries` (055 applied). */
  sourceSummaries?: MarketValuationSourceSummary[];
  methodVersion: string;
  calculatedAt: string;
  expiresAt: string;
}

/** Explicit column list: never select('*') from market tables. */
export const MARKET_VALUATION_COLUMNS =
  'pin_id, market, currency, low, fair, high, sold_count, active_count, confidence_score, confidence_band, sources, method_version, calculated_at, expires_at';

/** MARKET_VALUATION_COLUMNS plus the 055 per-source summaries. */
export const MARKET_VALUATION_COLUMNS_WITH_SUMMARIES = `${MARKET_VALUATION_COLUMNS}, source_summaries`;

const MARKETS: readonly MarketCode[] = ['UK', 'US', 'FR'];
const BANDS: readonly MarketConfidenceBand[] = ['insufficient', 'low', 'medium', 'high'];

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function mapSources(v: unknown): MarketValuationSource[] {
  if (!Array.isArray(v)) return [];
  const out: MarketValuationSource[] = [];
  for (const s of v) {
    if (typeof s !== 'object' || s === null) continue;
    const o = s as Record<string, unknown>;
    if (typeof o.source_id !== 'string') continue;
    out.push({
      sourceId: o.source_id,
      count: num(o.count) ?? 0,
      ...(typeof o.latest_date === 'string' ? { latestDate: o.latest_date } : {}),
    });
  }
  return out;
}

function mapSourceSummaries(v: unknown): MarketValuationSourceSummary[] {
  if (!Array.isArray(v)) return [];
  const out: MarketValuationSourceSummary[] = [];
  for (const s of v) {
    if (typeof s !== 'object' || s === null) continue;
    const o = s as Record<string, unknown>;
    if (typeof o.source_id !== 'string' || typeof o.provider !== 'string') continue;
    if (o.evidence_type !== 'sold' && o.evidence_type !== 'active') continue;
    const median = num(o.median);
    const low = num(o.low);
    const high = num(o.high);
    out.push({
      sourceId: o.source_id,
      provider: o.provider,
      evidenceType: o.evidence_type,
      count: num(o.count) ?? 0,
      ...(typeof o.latest_date === 'string' ? { latestDate: o.latest_date } : {}),
      ...(median !== undefined ? { median } : {}),
      ...(o.evidence_type === 'active' && low !== undefined ? { low } : {}),
      ...(o.evidence_type === 'active' && high !== undefined ? { high } : {}),
    });
  }
  return out;
}

/** Maps one market_valuations row; returns null for a row with an unknown market or band. */
export function mapMarketValuationRow(row: Record<string, unknown>): MarketValuation | null {
  const market = row.market as MarketCode;
  const band = row.confidence_band as MarketConfidenceBand;
  if (!MARKETS.includes(market) || !BANDS.includes(band)) return null;
  if (typeof row.pin_id !== 'string' || typeof row.currency !== 'string') return null;
  const low = num(row.low);
  const fair = num(row.fair);
  const high = num(row.high);
  return {
    pinId: row.pin_id,
    market,
    currency: row.currency,
    ...(low !== undefined ? { low } : {}),
    ...(fair !== undefined ? { fair } : {}),
    ...(high !== undefined ? { high } : {}),
    soldCount: num(row.sold_count) ?? 0,
    activeCount: num(row.active_count) ?? 0,
    confidenceScore: num(row.confidence_score) ?? 0,
    confidenceBand: band,
    sources: mapSources(row.sources),
    ...(Array.isArray(row.source_summaries) ? { sourceSummaries: mapSourceSummaries(row.source_summaries) } : {}),
    methodVersion: String(row.method_version ?? ''),
    calculatedAt: String(row.calculated_at ?? ''),
    expiresAt: String(row.expires_at ?? ''),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valuations for one pin (by pins.id), UK first, then FR, then US.
 * Returns [] for a non-UUID id and when the table does not exist yet
 * (migration 049 not applied: PostgREST 42P01 / PGRST205). Other errors throw.
 * `withSummaries` also reads source_summaries (055); if that column does not
 * exist yet (42703), it reads again without it.
 */
export async function getMarketValuations(
  client: MarketValuationsClient,
  pinId: string,
  opts: { withSummaries?: boolean } = {},
): Promise<MarketValuation[]> {
  if (!UUID_RE.test(pinId)) return [];
  const read = (columns: string) => client.from('market_valuations').select(columns).eq('pin_id', pinId);
  let { data, error } = await read(opts.withSummaries ? MARKET_VALUATION_COLUMNS_WITH_SUMMARIES : MARKET_VALUATION_COLUMNS);
  if (error && opts.withSummaries && (error as { code?: string }).code === '42703') {
    ({ data, error } = await read(MARKET_VALUATION_COLUMNS));
  }
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205') return [];
    throw new Error('Could not load market valuations');
  }
  const order: Record<MarketCode, number> = { UK: 0, FR: 1, US: 2 };
  return ((data ?? []) as Record<string, unknown>[])
    .map(mapMarketValuationRow)
    .filter((v): v is MarketValuation => v !== null)
    .sort((a, b) => order[a.market] - order[b.market]);
}

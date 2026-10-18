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
  methodVersion: string;
  calculatedAt: string;
  expiresAt: string;
}

/** Explicit column list: never select('*') from market tables. */
export const MARKET_VALUATION_COLUMNS =
  'pin_id, market, currency, low, fair, high, sold_count, active_count, confidence_score, confidence_band, sources, method_version, calculated_at, expires_at';

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
 */
export async function getMarketValuations(client: MarketValuationsClient, pinId: string): Promise<MarketValuation[]> {
  if (!UUID_RE.test(pinId)) return [];
  const { data, error } = await client
    .from('market_valuations')
    .select(MARKET_VALUATION_COLUMNS)
    .eq('pin_id', pinId);
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

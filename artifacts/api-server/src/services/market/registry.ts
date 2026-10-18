/**
 * Adapter registry (SG-03, #406). An adapter runs only when
 *   1. its `market_sources` row exists and has `enabled = true`, and
 *   2. its provider kill switch (`killSwitchEnv`, e.g. SOLDGRAPH_ENABLED) is "true".
 * Missing rows mean disabled, so a new adapter stays off until its row is
 * added and enabled.
 *
 * Enabled adapters are returned in priority order: sold evidence before
 * asking prices, then UK > FR > US, then registration order. Planning in this
 * order spends a limited credit budget on UK sold prices first.
 */
import type { Market, MarketplaceAdapter } from "./adapter";

/** The market_sources columns the registry needs. */
export interface MarketSourceSetting {
  id: string;
  enabled: boolean;
}

export interface AdapterRegistry {
  list(): MarketplaceAdapter[];
  get(sourceId: string): MarketplaceAdapter | undefined;
  enabled(sources: readonly MarketSourceSetting[], env?: NodeJS.ProcessEnv): MarketplaceAdapter[];
}

const MARKET_PRIORITY: Record<Market, number> = { UK: 0, FR: 1, US: 2 };

export function killSwitchOn(adapter: MarketplaceAdapter, env: NodeJS.ProcessEnv = process.env): boolean {
  return adapter.killSwitchEnv === undefined || env[adapter.killSwitchEnv] === "true";
}

export function createAdapterRegistry(adapters: readonly MarketplaceAdapter[]): AdapterRegistry {
  const byId = new Map<string, MarketplaceAdapter>();
  for (const a of adapters) {
    if (byId.has(a.sourceId)) throw new Error(`Duplicate market adapter: ${a.sourceId}`);
    byId.set(a.sourceId, a);
  }
  const ordered = [...byId.values()]
    .map((a, i) => ({ a, i }))
    .sort(
      (x, y) =>
        (x.a.evidenceType === "sold" ? 0 : 1) - (y.a.evidenceType === "sold" ? 0 : 1) ||
        MARKET_PRIORITY[x.a.market] - MARKET_PRIORITY[y.a.market] ||
        x.i - y.i,
    )
    .map(x => x.a);

  return {
    list: () => [...ordered],
    get: id => byId.get(id),
    enabled(sources, env = process.env) {
      const on = new Set(sources.filter(s => s.enabled === true).map(s => s.id));
      return ordered.filter(a => on.has(a.sourceId) && killSwitchOn(a, env));
    },
  };
}

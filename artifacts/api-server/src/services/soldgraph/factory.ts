/**
 * The only way the running server builds a Soldgraph client (#404 security
 * carry-over, #408).
 *
 * - Refuses unless SOLDGRAPH_ENABLED is "true" (kill switch, off by default).
 * - Refuses unless the Supabase-backed usage store can be built
 *   (createSupabaseUsageStoreFromEnv). It never falls back to the in-memory
 *   store, which resets on restart and would let spend pass the monthly cap.
 *   The Supabase store implements reserveCredit, so the budget check and the
 *   reservation are one locked database step.
 *
 * Building a client makes no network call. Errors are generic and carry no
 * configuration values.
 */
import { createSoldgraphClient, type SoldgraphClient, type SoldgraphClientOptions } from "./client";
import { ProviderDisabledError } from "./errors";
import { SupabaseUsageStore, createSupabaseUsageStoreFromEnv } from "./supabase-usage-store";

export interface SoldgraphFactoryDeps {
  /** Overridable for tests. */
  createStore?: (env: NodeJS.ProcessEnv) => SupabaseUsageStore | null;
  createClient?: (options: SoldgraphClientOptions) => SoldgraphClient;
}

export type SoldgraphClientOverrides = Omit<SoldgraphClientOptions, "usageStore" | "enabled">;

export function createSoldgraphClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: SoldgraphClientOverrides = {},
  deps: SoldgraphFactoryDeps = {},
): SoldgraphClient {
  if (env.SOLDGRAPH_ENABLED !== "true") throw new ProviderDisabledError("disabled");
  const store = (deps.createStore ?? createSupabaseUsageStoreFromEnv)(env);
  if (!(store instanceof SupabaseUsageStore) || typeof store.reserveCredit !== "function") {
    throw new ProviderDisabledError("not_configured");
  }
  // `enabled` is left unset so the client re-reads SOLDGRAPH_ENABLED before
  // every call: turning the kill switch off stops a client already built.
  return (deps.createClient ?? createSoldgraphClient)({ ...overrides, usageStore: store });
}

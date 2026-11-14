/**
 * Builds the price-request dependencies for the running server. Service
 * role only. Returns null when the service key is missing: a request then
 * fails closed (503), unlike the contributor usage caps, which fail open,
 * because this path spends paid credits.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../../lib/logger";
import { createSoldgraphClientFromEnv } from "../../soldgraph/factory";
import { SupabaseRefreshStore } from "../refresh/store";
import type { PriceRequestDeps } from "./service";
import { SupabasePriceRequestStore } from "./store";

let cached: { key: string; db: SupabaseClient } | null = null;

function serviceClient(env: NodeJS.ProcessEnv): SupabaseClient | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const cacheKey = `${url}|${key.length}`;
  if (!cached || cached.key !== cacheKey) {
    cached = { key: cacheKey, db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
  }
  return cached.db;
}

export function createPriceRequestDeps(env: NodeJS.ProcessEnv = process.env): PriceRequestDeps | null {
  const db = serviceClient(env);
  if (!db) return null;
  return {
    requests: new SupabasePriceRequestStore(db),
    refresh: new SupabaseRefreshStore(db, env),
    env,
    createClient: () => createSoldgraphClientFromEnv(env),
    log: {
      warn: (obj, msg) => logger.warn(obj, msg),
      error: (obj, msg) => logger.error(obj, msg),
    },
  };
}

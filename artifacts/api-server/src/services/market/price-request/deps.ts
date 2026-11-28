/**
 * Builds the price-request dependencies for the running server. Service
 * role only. Returns null when the service key is missing: a request then
 * fails closed (503), unlike the contributor usage caps, which fail open,
 * because this path spends paid credits.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../../lib/logger";
import { createSoldgraphClientFromEnv } from "../../soldgraph/factory";
import { SupabaseRefreshStore } from "../refresh/store";
import type { PriceRequestDeps } from "./service";
import { SupabasePriceRequestStore } from "./store";
import { SupabaseBatchStore } from "./batch-store";
import type { AdminBatchDeps } from "./admin-batch";

let cached: { key: string; db: SupabaseClient } | null = null;

function serviceClient(env: NodeJS.ProcessEnv): SupabaseClient | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // A hash, never the key itself: a rotated key builds a new client.
  const cacheKey = createHash("sha256").update(`${url}|${key}`).digest("hex");
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

/** Dependencies for the admin "Price pins" run (admin-batch.ts). Null without the service key. */
export function createAdminBatchDeps(env: NodeJS.ProcessEnv = process.env): AdminBatchDeps | null {
  const db = serviceClient(env);
  const request = createPriceRequestDeps(env);
  if (!db || !request) return null;
  const store = new SupabaseBatchStore(db, env);
  const { env: _env, ...rest } = request;
  return {
    store,
    request: rest,
    env,
    popularPinhuntIds: count => store.popularPinhuntIds(count),
  };
}

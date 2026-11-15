/**
 * Entry point for scripts/market-price-batch.mjs. The script parses the
 * arguments first, passes the staging guard, builds the service-role client,
 * then calls executeBatchCli. Output never includes keys, titles or links.
 */
import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SoldgraphClient, SoldgraphLogger } from "../../soldgraph/client";
import { createSoldgraphClientFromEnv } from "../../soldgraph/factory";
import { SupabaseRefreshStore } from "../refresh/store";
import { BatchUsageError, formatBatch, parseBatchArgs, runBatch, type BatchDeps, type BatchOptions } from "./batch";
import { SupabaseBatchStore } from "./batch-store";
import { SupabasePriceRequestStore } from "./store";

export { BatchUsageError };

const quietLogger: SoldgraphLogger = { info() {}, warn() {}, error() {} };

export function parseArgs(argv: string[]): BatchOptions {
  return parseBatchArgs(argv, p => fs.readFileSync(p, "utf8"));
}

export interface BatchCliDeps {
  db: SupabaseClient;
  env: NodeJS.ProcessEnv;
  print: (line: string) => void;
  createClient?: () => SoldgraphClient;
}

/** Runs a parsed batch command. Returns the process exit code. */
export async function executeBatchCli(opts: BatchOptions, d: BatchCliDeps): Promise<number> {
  const deps: BatchDeps = {
    store: new SupabaseBatchStore(d.db, d.env),
    request: {
      requests: new SupabasePriceRequestStore(d.db),
      refresh: new SupabaseRefreshStore(d.db, d.env),
      createClient: d.createClient ?? (() => createSoldgraphClientFromEnv(d.env, { logger: quietLogger })),
      log: { warn() {}, error() {} },
    },
    env: d.env,
    progress: d.print,
  };
  const r = await runBatch(opts, deps);
  formatBatch(r, opts).forEach(l => d.print(l));
  if (opts.apply && !r.applied) return 1;
  return r.stoppedBy && r.stoppedBy !== "ceiling" ? 2 : 0;
}

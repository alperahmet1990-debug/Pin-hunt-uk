/**
 * Loads the market refresh code (src/services/market/refresh/cli.ts) for the
 * maintainer scripts market-refresh.mjs and market-usage.mjs (#409).
 *
 * The service code is TypeScript with extensionless imports, so Node can't
 * import it directly. This bundles it with esbuild (already a dev dependency
 * of the API server) into node_modules/.cache, then imports the bundle:
 *   - workspace packages (@workspace/*) and source files are bundled;
 *   - every other package (@supabase/supabase-js) stays external and is
 *     resolved from artifacts/api-server/node_modules;
 *   - the server logger is swapped for a silent one, so nothing the client
 *     or eBay helpers log reaches the terminal.
 * Bundling makes no network call and connects to nothing.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ENTRY = path.join(API_ROOT, "src/services/market/refresh/cli.ts");
const CACHE_DIR = path.join(API_ROOT, "node_modules/.cache/pinhunt-market-refresh");

const SILENT_LOGGER = `
const noop = () => {};
const make = () => ({ trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child: make, level: "silent" });
export const logger = make();
`;

/** esbuild plugin: bundle workspace code, keep other packages external, silence the logger. */
export const marketRefreshPlugin = {
  name: "pinhunt-market-refresh",
  setup(build) {
    build.onResolve({ filter: /(^|\/)lib\/logger$/ }, (args) =>
      args.importer.startsWith(path.join(API_ROOT, "src")) ? { path: "silent-logger", namespace: "pinhunt-stub" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "pinhunt-stub" }, () => ({ contents: SILENT_LOGGER, loader: "js" }));
    build.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith("@workspace/") || args.path.startsWith("node:") ? undefined : { path: args.path, external: true });
  },
};

/** Bundles the entry to a string (exported for the test). */
export async function bundleMarketRefresh() {
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
    plugins: [marketRefreshPlugin],
  });
  return result.outputFiles[0].text;
}

/** Bundles and imports the refresh module. */
export async function loadMarketRefresh() {
  const code = await bundleMarketRefresh();
  const hash = crypto.createHash("sha256").update(code).digest("hex").slice(0, 16);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `cli-${hash}.mjs`);
  await fs.writeFile(file, code);
  return import(pathToFileURL(file).href);
}

/**
 * Staging guard — refuses to let a script write anywhere except the staging
 * Supabase project.
 *
 * A script that creates test users or synthetic rows must never reach
 * production. All of these must hold, or assertStagingTarget() throws:
 *   1. PINHUNT_ENV is exactly "staging" (set only in .env.staging).
 *   2. STAGING_PROJECT_REF is set, and SUPABASE_URL is
 *      https://<STAGING_PROJECT_REF>.supabase.co.
 *   3. SUPABASE_URL is not the URL in the production env file (.env), when
 *      that file exists. The production URL is compared, never printed.
 *
 * Pure apart from the optional file read, so it is unit-tested in
 * staging-guard.test.mjs.
 */
import fs from "node:fs";

const REF_RE = /^[a-z0-9]{20}$/;

export function normaliseUrl(url) {
  return String(url ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

/** Reads SUPABASE_URL from a dotenv file without exposing any other value. */
export function readSupabaseUrlFromEnvFile(path) {
  let text;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const line = text.split(/\r?\n/).find((l) => /^\s*SUPABASE_URL\s*=/.test(l));
  if (!line) return null;
  return line.replace(/^\s*SUPABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim() || null;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ productionUrl?: string | null }} [opts]
 * @returns {{ ref: string, url: string }}
 */
export function assertStagingTarget(env, opts = {}) {
  if (env.PINHUNT_ENV !== "staging") {
    throw new Error('Refusing to run: PINHUNT_ENV must be "staging" (use --env-file=.env.staging).');
  }
  const ref = String(env.STAGING_PROJECT_REF ?? "").trim();
  if (!REF_RE.test(ref)) {
    throw new Error("Refusing to run: STAGING_PROJECT_REF must be the 20-character staging project ref.");
  }
  const url = normaliseUrl(env.SUPABASE_URL);
  if (url !== `https://${ref}.supabase.co`) {
    throw new Error("Refusing to run: SUPABASE_URL does not match STAGING_PROJECT_REF.");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Refusing to run: SUPABASE_SERVICE_ROLE_KEY (staging) is not set.");
  }
  if (opts.productionUrl && normaliseUrl(opts.productionUrl) === url) {
    throw new Error("Refusing to run: SUPABASE_URL is the production project in .env.");
  }
  return { ref, url };
}

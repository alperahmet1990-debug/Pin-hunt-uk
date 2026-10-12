/**
 * Staging guard — every script that can write to a Supabase database must
 * pass this before it creates a client. It refuses unless the target is
 * positively identified as the staging project:
 *
 *   1. PINHUNT_ENV is exactly "staging" (set only in .env.staging).
 *   2. STAGING_PROJECT_REF and PRODUCTION_PROJECT_REF are both set, valid,
 *      and different. Without the production ref the target can't be
 *      verified, so the guard refuses.
 *   3. SUPABASE_URL is https://<STAGING_PROJECT_REF>.supabase.co.
 *   4. That ref is not production: not PRODUCTION_PROJECT_REF, and not the
 *      project in any local production env file (.env). Those URLs are
 *      compared, never printed.
 *   5. The target project holds the private marker bucket that only
 *      `staging-db restore` creates (STAGING_MARKER_BUCKET). Production never
 *      has it, so even a mistyped ref can't pass.
 *
 * Checks 1–4 are pure (assertStagingTarget). Check 5 needs the network
 * (assertStagingMarker). requireStaging() runs both and exits on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_MARKER_BUCKET = "pinhunt-staging-marker";
export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
/** Env files that hold the everyday (production) project, relative to the repo root. */
export const PRODUCTION_ENV_FILES = ["artifacts/api-server/.env", "artifacts/pinhunt/.env", "scripts/.env", ".env"];

const REF_RE = /^[a-z0-9]{20}$/;

export function isValidRef(ref) {
  return REF_RE.test(String(ref ?? ""));
}

/** "https://<ref>.supabase.co" (optional trailing slash, any case) → ref, else null. */
export function refFromSupabaseUrl(url) {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i.exec(String(url ?? "").trim().replace(/^["']|["']$/g, ""));
  return m ? m[1].toLowerCase() : null;
}

/** Reads one key from a dotenv file without exposing any other value. */
export function readEnvValue(file, key) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const re = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)$`);
  for (const line of text.split(/\r?\n/)) {
    const m = re.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "") || null;
  }
  return null;
}

/** Every ref we know to be production: the declared one plus local .env files. */
export function productionRefs(env, { repoRoot = REPO_ROOT, files = PRODUCTION_ENV_FILES } = {}) {
  const refs = new Set();
  if (isValidRef(env.PRODUCTION_PROJECT_REF)) refs.add(env.PRODUCTION_PROJECT_REF);
  for (const rel of files) {
    const file = path.join(repoRoot, rel);
    for (const key of ["SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]) {
      const ref = refFromSupabaseUrl(readEnvValue(file, key));
      if (ref) refs.add(ref);
    }
  }
  return refs;
}

/**
 * Checks 1–4. Throws with a reason; returns { ref, url } when the target is
 * staging. `production` can be injected for tests.
 */
export function assertStagingTarget(env, { production } = {}) {
  if (env.PINHUNT_ENV !== "staging") {
    throw new Error('PINHUNT_ENV must be "staging" (run with --env-file=.env.staging).');
  }
  const ref = String(env.STAGING_PROJECT_REF ?? "").trim();
  if (!isValidRef(ref)) {
    throw new Error("STAGING_PROJECT_REF must be the 20-character staging project ref.");
  }
  if (!isValidRef(env.PRODUCTION_PROJECT_REF)) {
    throw new Error("PRODUCTION_PROJECT_REF is not set, so the target can't be verified as non-production.");
  }
  if (env.PRODUCTION_PROJECT_REF === ref) {
    throw new Error("STAGING_PROJECT_REF is the production project.");
  }
  const urlRef = refFromSupabaseUrl(env.SUPABASE_URL);
  if (urlRef !== ref) {
    throw new Error("SUPABASE_URL is not https://<STAGING_PROJECT_REF>.supabase.co.");
  }
  const prod = production ?? productionRefs(env);
  if (prod.has(ref)) {
    throw new Error("the target is a production project (it matches PRODUCTION_PROJECT_REF or a local .env).");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY (staging) is not set.");
  }
  return { ref, url: `https://${ref}.supabase.co` };
}

/** Check 5: the marker bucket exists in the target project. */
export async function assertStagingMarker(client) {
  const { data, error } = await client.storage.getBucket(STAGING_MARKER_BUCKET);
  if (error || !data || data.id !== STAGING_MARKER_BUCKET) {
    throw new Error(
      `the target has no "${STAGING_MARKER_BUCKET}" bucket, so it isn't a prepared staging project. Run staging:restore first.`,
    );
  }
}

/**
 * Runs every check, then returns { ref, url }. On any failure it prints the
 * reason and exits with status 1, before the caller has created a client.
 */
export async function requireStaging(env = process.env, { createClient, exit = (code) => process.exit(code) } = {}) {
  try {
    const target = assertStagingTarget(env);
    const make = createClient ?? (await import("@supabase/supabase-js")).createClient;
    await assertStagingMarker(make(target.url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));
    console.log(`[staging-guard] verified staging project ${target.ref}`);
    return target;
  } catch (err) {
    console.error(`[staging-guard] Refusing to run: ${err.message}`);
    exit(1);
    throw err;
  }
}

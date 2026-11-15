/**
 * Production guard: the only way a maintainer script may write to the
 * production Supabase project. Today only scripts/market-price-batch.mjs uses
 * it, behind its --production flag. Every other script stays staging-only
 * (staging-guard.mjs). Agents never run a script against production: the
 * operating model lists production data changes as human-only.
 *
 * It refuses unless the target is positively identified as production and the
 * maintainer has typed the production project ref on the command line:
 *
 *   1. PINHUNT_ENV is exactly "production" (set only in the maintainer's
 *      local production env file, which is gitignored).
 *   2. PRODUCTION_PROJECT_REF is a valid ref, and the ref given with
 *      --production on the command line is exactly that ref.
 *   3. STAGING_PROJECT_REF is set, valid and different, so the two can't be
 *      confused.
 *   4. SUPABASE_URL is https://<PRODUCTION_PROJECT_REF>.supabase.co.
 *   5. The target does NOT hold the staging marker bucket that only
 *      `staging-db restore` creates. A staging project can't pass.
 *
 * Checks 1–4 are pure (assertProductionTarget). Check 5 needs the network
 * (assertNotStagingMarker). requireProduction() runs both and exits on
 * failure, before the caller creates its own client. No value is printed
 * except the project ref.
 */
import { STAGING_MARKER_BUCKET, isValidRef, refFromSupabaseUrl } from "./staging-guard.mjs";

/** Checks 1–4. Throws with a reason; returns { ref, url } when the target is production. */
export function assertProductionTarget(env, confirmedRef) {
  if (env.PINHUNT_ENV !== "production") {
    throw new Error('PINHUNT_ENV must be "production" (run with your local production env file).');
  }
  const ref = String(env.PRODUCTION_PROJECT_REF ?? "").trim();
  if (!isValidRef(ref)) {
    throw new Error("PRODUCTION_PROJECT_REF must be the 20-character production project ref.");
  }
  if (String(confirmedRef ?? "").trim() !== ref) {
    throw new Error("--production must be followed by the production project ref, typed exactly (it doesn't match PRODUCTION_PROJECT_REF).");
  }
  const staging = String(env.STAGING_PROJECT_REF ?? "").trim();
  if (!isValidRef(staging)) {
    throw new Error("STAGING_PROJECT_REF is not set, so production can't be told apart from staging.");
  }
  if (staging === ref) {
    throw new Error("STAGING_PROJECT_REF and PRODUCTION_PROJECT_REF are the same project.");
  }
  if (refFromSupabaseUrl(env.SUPABASE_URL) !== ref) {
    throw new Error("SUPABASE_URL is not https://<PRODUCTION_PROJECT_REF>.supabase.co.");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY (production) is not set.");
  }
  return { ref, url: `https://${ref}.supabase.co` };
}

/** Storage's answer for a bucket that doesn't exist. Anything else is not proof. */
const BUCKET_NOT_FOUND_RE = /\bbucket not found\b/i;

/**
 * Check 5: the target must not be a prepared staging project. It passes only
 * on a positive, specific "Bucket not found" error from the storage API.
 * Everything else refuses: the marker bucket itself, a generic "Not Found"
 * (for example a misrouted request), any other error, and an answer with
 * neither an error nor the bucket. A network or permission problem can't be
 * mistaken for production.
 */
export async function assertNotStagingMarker(client) {
  const { data, error } = await client.storage.getBucket(STAGING_MARKER_BUCKET);
  if (!error) {
    if (data && data.id === STAGING_MARKER_BUCKET) {
      throw new Error(`the target holds the "${STAGING_MARKER_BUCKET}" bucket, so it is a staging project, not production.`);
    }
    throw new Error("could not confirm the target is not staging (unexpected bucket check response).");
  }
  if (!BUCKET_NOT_FOUND_RE.test(String(error.message ?? ""))) {
    throw new Error("could not confirm the target is not staging (bucket check failed).");
  }
}

/**
 * Runs every check, then returns { ref, url }. On any failure it prints the
 * reason and exits with status 1, before the caller has created a client.
 */
export async function requireProduction(env = process.env, confirmedRef, { createClient, exit = (code) => process.exit(code) } = {}) {
  try {
    const target = assertProductionTarget(env, confirmedRef);
    const make = createClient ?? (await import("@supabase/supabase-js")).createClient;
    await assertNotStagingMarker(make(target.url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));
    console.log(`[production-guard] verified PRODUCTION project ${target.ref}`);
    return target;
  } catch (err) {
    console.error(`[production-guard] Refusing to run: ${err.message}`);
    exit(1);
    throw err;
  }
}

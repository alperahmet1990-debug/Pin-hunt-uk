/**
 * Production guard: the mirror image of staging-guard.mjs, for the few
 * maintainer-run scripts that are explicitly approved to write to PRODUCTION
 * (docs/catalogue-sync/PRODUCTION-CATALOGUE-RESET.md). Every check must pass:
 *
 *   1. PINHUNT_ENV is exactly "production".
 *   2. PRODUCTION_PROJECT_REF is a valid ref, and differs from STAGING_PROJECT_REF.
 *   3. SUPABASE_URL is https://<PRODUCTION_PROJECT_REF>.supabase.co.
 *   4. The database's own marker, pinhunt_environment() (073_RUNBOOK.md), says "production".
 *   5. The staging marker bucket does NOT exist.
 *   6. Before any write, the person types the production ref (confirmWrite).
 *
 * Checks 1-3 are pure (assertProductionTarget); 4-5 need the network.
 */
import readline from "node:readline";
import { isValidRef, refFromSupabaseUrl, STAGING_MARKER_BUCKET } from "./staging-guard.mjs";

export function assertProductionTarget(env) {
  if (env.PINHUNT_ENV !== "production") throw new Error('PINHUNT_ENV must be "production" in the production settings file.');
  const ref = String(env.PRODUCTION_PROJECT_REF ?? "").trim();
  if (!isValidRef(ref)) throw new Error("PRODUCTION_PROJECT_REF must be the 20-character production project ref.");
  if (env.STAGING_PROJECT_REF && String(env.STAGING_PROJECT_REF).trim() === ref) throw new Error("PRODUCTION_PROJECT_REF is the same as STAGING_PROJECT_REF.");
  if (refFromSupabaseUrl(env.SUPABASE_URL) !== ref) throw new Error("SUPABASE_URL is not https://<PRODUCTION_PROJECT_REF>.supabase.co.");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY (production) is not set.");
  return { ref, url: `https://${ref}.supabase.co` };
}

export async function assertProductionMarker(db) {
  const { data, error } = await db.rpc("pinhunt_environment");
  if (error) throw new Error("couldn't read pinhunt_environment() (073 project marker). Nothing was changed.");
  if (data !== "production") throw new Error(`this database says it is "${data}", not "production". Nothing was changed.`);
  if (await db.storageBucketExists(STAGING_MARKER_BUCKET)) throw new Error("this project has the staging marker bucket. Nothing was changed.");
}

/** Asks the person to type the production ref. Resolves only on an exact match. */
export async function confirmWrite(ref, what, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY && input === process.stdin) throw new Error("run this in a terminal: writing to production needs a typed confirmation.");
  const rl = readline.createInterface({ input, output });
  const answer = await new Promise((resolve) => rl.question(`\nAbout to ${what} in PRODUCTION.\nType the production project ref to continue (anything else stops): `, resolve));
  rl.close();
  if (String(answer).trim() !== ref) throw new Error("confirmation didn't match. Nothing was changed.");
}

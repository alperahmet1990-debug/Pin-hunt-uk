/**
 * Copy the public catalogue from main into staging (#372) — the logic behind
 * scripts/copy-catalogue-to-staging.mjs, free of network side effects so it
 * can be tested.
 *
 * The one approved exception to "staging gets schema, never data": the
 * public catalogue, which every app user can already see. Main is read with
 * its anon (public) key only, so RLS limits the copy to exactly that. Nothing
 * else is ever copied: no accounts, collections, messages, submissions or
 * files. Image URLs keep pointing at main's public bucket.
 */
import { isValidRef, refFromSupabaseUrl } from "./staging-guard.mjs";

/**
 * Copied in this order (parents first). `key` is the primary key used for
 * upserts; `natural` is a unique column whose clash with an existing staging
 * row is resolved by reusing the staging row (lookups) or skipping (pins).
 */
export const CATALOGUE_TABLES = [
  { table: "catalogue_sources", key: ["id"] },
  { table: "characters", key: ["id"], natural: "name", reuse: true },
  { table: "categories", key: ["id"], natural: "name", reuse: true },
  { table: "pin_sets", key: ["id"], natural: "normalised_series", reuse: true },
  { table: "pins", key: ["id"], natural: "pinhunt_id", reuse: false },
  { table: "pin_set_memberships", key: ["pin_id", "set_id"], refs: { pin_id: "pins", set_id: "pin_sets" } },
  { table: "pin_characters", key: ["pin_id", "character_id"], refs: { pin_id: "pins", character_id: "characters" } },
  { table: "pin_categories", key: ["pin_id", "category_id"], refs: { pin_id: "pins", category_id: "categories" } },
  { table: "pin_external_ids", key: ["id"], refs: { pin_id: "pins" } },
  { table: "pin_images", key: ["id"], refs: { pin_id: "pins" } },
];
export const CATALOGUE_TABLE_NAMES = new Set(CATALOGUE_TABLES.map((t) => t.table));

/** Filters applied when reading main, on top of RLS (which already enforces them for anon). */
export const MAIN_FILTERS = {
  pins: [["eq", "verification_status", "verified"], ["eq", "is_searchable", true]],
  pin_images: [["eq", "public_display_allowed", true], ["neq", "source", "pin_and_pop"]],
};

/** Columns that point at a person. Always cleared: staging has none of main's users. */
export const PERSON_COLUMNS = ["submitted_by", "uploaded_by", "reviewed_by", "created_by", "updated_by", "imported_by", "changed_by", "approved_by", "user_id", "owner_id"];

/** Links to private admin records that aren't copied (pins.import_batch_id → import_batches). Cleared too. */
export const INTERNAL_LINK_COLUMNS = ["import_batch_id"];

// ── main connection checks ──────────────────────────────────────────────────

function jwtRole(key) {
  const parts = String(key).split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

/**
 * Main may only be read with its public anon key. Refuses a secret or
 * service-role key, or anything that can't be recognised as public.
 */
export function assertAnonKey(key, { stagingServiceRoleKey } = {}) {
  const k = String(key ?? "").trim();
  if (!k) throw new Error("MAIN_SUPABASE_ANON_KEY is not set.");
  if (stagingServiceRoleKey && k === stagingServiceRoleKey) throw new Error("MAIN_SUPABASE_ANON_KEY is the staging service-role key.");
  if (k.startsWith("sb_publishable_")) return;
  if (k.startsWith("sb_secret_")) throw new Error("MAIN_SUPABASE_ANON_KEY is a secret key. Use main's anon (public) key.");
  const role = jwtRole(k);
  if (role === "anon") return;
  if (role) throw new Error(`MAIN_SUPABASE_ANON_KEY has role "${role}". Use main's anon (public) key.`);
  throw new Error("MAIN_SUPABASE_ANON_KEY isn't a recognisable Supabase anon key.");
}

/** Main must be the production project named in the staging settings, and not staging itself. */
export function assertMainTarget(env, stagingRef) {
  const ref = refFromSupabaseUrl(env.MAIN_SUPABASE_URL);
  if (!ref) throw new Error("MAIN_SUPABASE_URL must be https://<main project ref>.supabase.co.");
  if (ref === stagingRef) throw new Error("MAIN_SUPABASE_URL is the staging project.");
  if (!isValidRef(env.PRODUCTION_PROJECT_REF) || ref !== env.PRODUCTION_PROJECT_REF) {
    throw new Error("MAIN_SUPABASE_URL doesn't match PRODUCTION_PROJECT_REF.");
  }
  return { ref, url: `https://${ref}.supabase.co` };
}

// ── planning ────────────────────────────────────────────────────────────────

const keyOf = (row, cols) => cols.map((c) => String(row[c])).join("|");

/** A copy of the row with person columns and private admin links cleared. */
export function scrubRow(row) {
  const out = { ...row };
  for (const col of [...PERSON_COLUMNS, ...INTERNAL_LINK_COLUMNS]) if (col in out) out[col] = null;
  return out;
}

/**
 * Works out what to write. `main` and `staging` map each table name to its
 * rows (staging only needs the natural-key tables: id + natural column).
 *
 * - Lookup rows (characters, categories, sets) whose natural key already
 *   exists in staging under another id reuse the staging row; links are
 *   rewritten to it.
 * - Pins whose PinHunt ID already exists in staging under another id are
 *   skipped (never overwritten), along with their links.
 * - Link rows are only kept when every row they point at is being copied
 *   or already exists, so archived pins' links never come along.
 */
export function planCopy(main, staging) {
  const idMap = {}; // table -> Map(mainId -> stagingId)
  const present = {}; // table -> Set(ids that will exist in staging)
  const plan = [];

  for (const spec of CATALOGUE_TABLES) {
    const rows = (main[spec.table] ?? []).map(scrubRow);
    const skipped = [];
    let write = rows;

    if (spec.natural) {
      const byNatural = new Map((staging[spec.table] ?? []).map((r) => [r[spec.natural], r.id]));
      const map = new Map();
      write = [];
      for (const row of rows) {
        const existing = byNatural.get(row[spec.natural]);
        if (existing && existing !== row.id) {
          if (spec.reuse) map.set(row.id, existing);
          else skipped.push({ key: row[spec.natural], reason: `${spec.natural} already in staging under another id` });
          continue;
        }
        map.set(row.id, row.id);
        write.push(row);
      }
      idMap[spec.table] = map;
      present[spec.table] = new Set(map.values());
    }

    if (spec.refs) {
      write = [];
      for (const row of rows) {
        const out = { ...row };
        let ok = true;
        for (const [col, parent] of Object.entries(spec.refs)) {
          const mapped = idMap[parent]?.get(row[col]);
          if (!mapped) { ok = false; break; }
          out[col] = mapped;
        }
        if (ok) write.push(out);
      }
      // Two main rows can map onto the same staging row; keep one.
      const seen = new Set();
      write = write.filter((r) => { const k = keyOf(r, spec.key); if (seen.has(k)) return false; seen.add(k); return true; });
      const dropped = rows.length - write.length;
      if (dropped) skipped.push({ key: `${dropped} row(s)`, reason: "link to a pin, set, character or category that isn't copied" });
    }

    plan.push({ table: spec.table, key: spec.key, rows: write, read: rows.length, skipped });
  }
  return plan;
}

/** One line per table for the report. */
export function summarisePlan(plan) {
  return plan.map((p) => `${p.table.padEnd(20)} read ${String(p.read).padStart(6)}  write ${String(p.rows.length).padStart(6)}${p.skipped.length ? `  skipped: ${p.skipped.map((s) => `${s.key} (${s.reason})`).slice(0, 3).join("; ")}${p.skipped.length > 3 ? ` … +${p.skipped.length - 3} more` : ""}` : ""}`);
}

// ── run ─────────────────────────────────────────────────────────────────────

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/**
 * deps: { readMain(table, filters) → rows, readStaging(table, columns) → rows,
 *         upsert(table, rows, keyColumns) → void (throws on error), log }
 * Never deletes. Without `apply` it only reports.
 */
export async function runCopy({ apply }, deps) {
  const main = {};
  const staging = {};
  for (const spec of CATALOGUE_TABLES) {
    main[spec.table] = await deps.readMain(spec.table, MAIN_FILTERS[spec.table] ?? []);
    if (spec.natural) staging[spec.table] = await deps.readStaging(spec.table, ["id", spec.natural]);
  }
  const plan = planCopy(main, staging);
  deps.log(apply ? "copy (apply):" : "copy (dry run — add --apply to write):");
  for (const line of summarisePlan(plan)) deps.log(`  ${line}`);
  if (!apply) return { plan, written: 0, failed: [] };

  const failed = [];
  let written = 0;
  for (const step of plan) {
    for (const part of chunk(step.rows, 200)) {
      try {
        await deps.upsert(step.table, part, step.key);
        written += part.length;
      } catch {
        // Find the bad rows one at a time so the rest still land.
        for (const row of part) {
          try {
            await deps.upsert(step.table, [row], step.key);
            written += 1;
          } catch (err) {
            failed.push({ table: step.table, key: keyOf(row, step.key), reason: err.message });
          }
        }
      }
    }
  }
  deps.log(`copy: ${written} row(s) written, ${failed.length} failed.`);
  for (const f of failed.slice(0, 20)) deps.log(`  failed ${f.table} ${f.key}: ${f.reason}`);
  if (failed.length > 20) deps.log(`  … ${failed.length - 20} more`);
  return { plan, written, failed };
}

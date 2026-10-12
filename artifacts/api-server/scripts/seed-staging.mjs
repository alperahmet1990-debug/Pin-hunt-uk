/**
 * Staging seed — creates the synthetic test accounts and collection state the
 * two-account test scenarios start from. STAGING ONLY.
 *
 * Refuses to run unless the staging guard passes (scripts/lib/staging-guard.mjs):
 * PINHUNT_ENV=staging, SUPABASE_URL matching STAGING_PROJECT_REF, and not the
 * production URL in .env. Uses only catalogue pins already in staging, so
 * import the catalogue into staging first (see the staging runbook).
 *
 * What it writes (staging only):
 *   - 3 auth users (example.com emails, confirmed): A, B and a staging admin
 *   - their profiles: username, town, approximate location, trade settings
 *   - user_pins for A and B (owned / ISO / For Trade, engineered matches)
 *   - one board for A
 * New passwords are written to .staging-test-accounts.local.json (gitignored,
 * mode 600) and never printed.
 *
 * Usage (from artifacts/api-server):
 *   node --env-file=.env.staging scripts/seed-staging.mjs              # dry run
 *   node --env-file=.env.staging scripts/seed-staging.mjs --apply
 *   node --env-file=.env.staging scripts/seed-staging.mjs --apply --reset-passwords
 *   node --env-file=.env.staging scripts/seed-staging.mjs --remove --apply   # delete the 3 users
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import { assertStagingTarget, readSupabaseUrlFromEnvFile } from "./lib/staging-guard.mjs";
import { STAGING_ACCOUNTS, planSeed } from "./lib/staging-seed-plan.mjs";

const APPLY = process.argv.includes("--apply");
const REMOVE = process.argv.includes("--remove");
const RESET_PASSWORDS = process.argv.includes("--reset-passwords");
const CREDENTIALS_FILE = ".staging-test-accounts.local.json";

let ref;
try {
  ({ ref } = assertStagingTarget(process.env, { productionUrl: readSupabaseUrlFromEnvFile(".env") }));
} catch (err) {
  console.error(`[seed-staging] ${err.message}`);
  process.exit(1);
}
console.log(`[seed-staging] target: staging project ${ref} — ${APPLY ? "APPLY" : "dry run"}${REMOVE ? " (remove)" : ""}`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function fetchAll(table, select, filters = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filters(supabase.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function findUsersByEmail(emails) {
  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  const found = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) if (u.email && wanted.has(u.email.toLowerCase())) found.set(u.email.toLowerCase(), u);
    if (data.users.length < 1000) break;
  }
  return found;
}

const newPassword = () => `St-${crypto.randomBytes(18).toString("base64url")}`;

async function remove() {
  const existing = await findUsersByEmail(STAGING_ACCOUNTS.map((a) => a.email));
  for (const acct of STAGING_ACCOUNTS) {
    const user = existing.get(acct.email);
    if (!user) { console.log(`  ${acct.email}: not present`); continue; }
    console.log(`  ${acct.email}: ${APPLY ? "deleting" : "would delete"} (cascades to their rows)`);
    if (APPLY) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw new Error(`deleteUser ${acct.email}: ${error.message}`);
    }
  }
}

async function seed() {
  // 1. Catalogue state in staging.
  const pins = await fetchAll("pins", "id, pinhunt_id", (q) =>
    q.eq("verification_status", "verified").eq("is_searchable", true));
  const memberships = await fetchAll("pin_set_memberships", "pin_id, set_id");
  const setRows = await fetchAll("pin_sets", "id, set_name");
  const members = new Map();
  for (const m of memberships) {
    if (!members.has(m.set_id)) members.set(m.set_id, []);
    members.get(m.set_id).push(m.pin_id);
  }
  const sets = setRows.map((s) => ({ ...s, pinIds: members.get(s.id) ?? [] }));
  const plan = planSeed(pins, sets);
  console.log(`  catalogue: ${pins.length} pins, ${sets.length} sets; set scenario: ${plan.set ? `${plan.set.name} (${plan.set.owned}/${plan.set.total})` : "none found"}`);
  console.log(`  user_pins rows: ${plan.rows.length}; boards: ${plan.boards.length}`);

  if (!APPLY) {
    console.log("  dry run: no users or rows written. Re-run with --apply.");
    return;
  }

  // 2. Users (idempotent). Passwords only change when created or --reset-passwords.
  const existing = await findUsersByEmail(STAGING_ACCOUNTS.map((a) => a.email));
  const ids = {};
  const credentials = [];
  for (const acct of STAGING_ACCOUNTS) {
    let user = existing.get(acct.email);
    let password = null;
    if (!user) {
      password = newPassword();
      const { data, error } = await supabase.auth.admin.createUser({ email: acct.email, password, email_confirm: true });
      if (error) throw new Error(`createUser ${acct.email}: ${error.message}`);
      user = data.user;
    } else if (RESET_PASSWORDS) {
      password = newPassword();
      const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
      if (error) throw new Error(`reset password ${acct.email}: ${error.message}`);
    }
    ids[acct.key] = user.id;
    if (password) credentials.push({ email: acct.email, username: acct.username, password });
  }

  // 3. Profiles (handle_new_user created the rows; the service role may set is_admin).
  for (const acct of STAGING_ACCOUNTS) {
    const { error } = await supabase.from("profiles").update({
      username: acct.username,
      display_name: acct.displayName,
      town: acct.town,
      county: acct.county,
      approx_lat: acct.approxLat,
      approx_lng: acct.approxLng,
      nearby_discovery_enabled: true,
      open_to_postal_trades: true,
      open_to_local_trades: true,
      is_admin: acct.isAdmin,
    }).eq("id", ids[acct.key]);
    if (error) throw new Error(`profile ${acct.username}: ${error.message}`);
  }

  // 4. Collections: replace A's and B's user_pins with the plan.
  for (const key of ["a", "b"]) {
    const { error } = await supabase.from("user_pins").delete().eq("user_id", ids[key]);
    if (error) throw new Error(`clear user_pins ${key}: ${error.message}`);
  }
  const { error: pinsErr } = await supabase.from("user_pins").insert(
    plan.rows.map((r) => ({ user_id: ids[r.account], pin_id: r.pinId, status: r.status, quantity: r.quantity })),
  );
  if (pinsErr) throw new Error(`insert user_pins: ${pinsErr.message}`);

  // 5. Boards.
  for (const b of plan.boards) {
    const { error } = await supabase.from("user_boards").upsert(
      { user_id: ids[b.account], id: b.id, name: b.name, pin_ids: b.pinIds, thumbnail_pin_id: b.pinIds[0] ?? null },
      { onConflict: "user_id,id" },
    );
    if (error) throw new Error(`board ${b.id}: ${error.message}`);
  }

  if (credentials.length) {
    const previous = fs.existsSync(CREDENTIALS_FILE) ? JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8")) : [];
    const merged = [...previous.filter((p) => !credentials.some((c) => c.email === p.email)), ...credentials];
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
    console.log(`  wrote ${credentials.length} new password(s) to ${CREDENTIALS_FILE} (gitignored)`);
  }
  console.log(`  done. Untouched pins for "add" tests: ${plan.expected.untouchedPinhuntIds.join(", ")}`);
}

(REMOVE ? remove() : seed()).catch((err) => {
  console.error(`[seed-staging] failed: ${err.message}`);
  process.exit(1);
});

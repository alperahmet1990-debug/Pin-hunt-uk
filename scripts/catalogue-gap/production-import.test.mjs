// Tests artifacts/api-server/scripts/import-pinandpop-production.mjs against an
// in-memory fake of Supabase's REST API. No network, no keys, no database.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../../artifacts/api-server/scripts/import-pinandpop-production.mjs";
import { assertProductionTarget } from "../../artifacts/api-server/scripts/lib/production-guard.mjs";

const PROD = "pppppppppppppppppppp";
const STAGING = "ssssssssssssssssssss";
const env = { PINHUNT_ENV: "production", PRODUCTION_PROJECT_REF: PROD, STAGING_PROJECT_REF: STAGING, SUPABASE_URL: `https://${PROD}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "test" };

/** A tiny PostgREST: tables in memory, the filters and headers the importer uses. */
function fakeSupabase({ environment = "production", stagingBucket = false, seed = {} } = {}) {
  const t = { catalogue_sources: [], pin_sets: [], pins: [], pin_set_memberships: [], pin_external_ids: [], pin_images: [], ...structuredClone(seed) };
  const unique = { catalogue_sources: ["id"], pin_sets: ["normalised_series"], pins: ["pinhunt_id"], pin_set_memberships: ["pin_id", "set_id"], pin_external_ids: ["source", "external_id"], pin_images: ["id"] };
  let n = 0;
  const log = [];
  const parseVal = (v) => (v === "null" ? null : v);
  const match = (row, k, v) => {
    if (k === "or") {
      return v.slice(1, -1).split(",").some((cond) => { const [c, op, ...rest] = cond.split("."); const val = rest.join("."); return op === "is" ? row[c] == null : op === "neq" ? row[c] !== val : row[c] === val; });
    }
    const [op, ...rest] = v.split("."); const val = rest.join(".");
    if (op === "eq") return String(row[k]) === val;
    if (op === "neq") return String(row[k]) !== val;
    if (op === "gte") return String(row[k] ?? "") >= val;
    if (op === "is") return val === "null" ? row[k] == null : String(row[k]) === val;
    if (op === "in") return val.slice(1, -1).match(/"((?:[^"\\]|\\.)*)"/g).map((q) => JSON.parse(q)).includes(String(row[k]));
    throw new Error(`fake: unsupported ${op}`);
  };
  return {
    tables: t,
    log,
    fetch: async (url, opts = {}) => {
      const u = new URL(url);
      const method = opts.method ?? "GET";
      log.push({ method, path: u.pathname });
      const json = (status, body, headers = {}) => ({ ok: status < 300, status, headers: { get: (h) => headers[h.toLowerCase()] ?? null }, json: async () => body, text: async () => (body == null ? "" : JSON.stringify(body)) });
      if (u.pathname === "/rest/v1/rpc/pinhunt_environment") return json(200, environment);
      if (u.pathname.startsWith("/storage/v1/bucket/")) return stagingBucket ? json(200, { id: "x" }) : json(400, { error: "not found" });
      const table = u.pathname.replace("/rest/v1/", "");
      const rows = t[table];
      if (!rows) return json(404, { message: `no table ${table}` });
      const filters = [...u.searchParams].filter(([k]) => !["select", "order", "limit", "offset", "on_conflict"].includes(k));
      const sel = (r) => filters.every(([k, v]) => match(r, k, v));
      const prefer = opts.headers?.Prefer ?? "";
      const pick = (r) => { const cols = u.searchParams.get("select"); if (!cols || cols === "*") return r; return Object.fromEntries(cols.split(",").map((c) => [c, r[c]])); };
      if (method === "GET" || method === "HEAD") {
        let out = rows.filter(sel);
        const order = u.searchParams.get("order");
        if (order) { const [c, dir] = order.split("."); out.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (dir === "desc" ? -1 : 1)); }
        const total = out.length;
        const off = Number(u.searchParams.get("offset") ?? 0);
        const lim = u.searchParams.has("limit") ? Number(u.searchParams.get("limit")) : Infinity;
        out = out.slice(off, off + lim);
        return json(200, method === "HEAD" ? null : out.map(pick), { "content-range": `0-${Math.max(0, out.length - 1)}/${total}` });
      }
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (method === "POST") {
        const list = Array.isArray(body) ? body : [body];
        const keys = (u.searchParams.get("on_conflict") ?? unique[table].join(",")).split(",");
        const written = [];
        for (const r of list) {
          const existing = rows.find((x) => keys.every((k) => String(x[k]) === String(r[k])) && keys.every((k) => r[k] !== undefined));
          if (existing && prefer.includes("resolution=merge-duplicates")) { Object.assign(existing, r); written.push(existing); }
          else if (existing && prefer.includes("resolution=ignore-duplicates")) continue;
          else if (existing) return json(409, { message: "duplicate key" });
          else { const row = { id: r.id ?? `id-${++n}`, ...r }; rows.push(row); written.push(row); }
        }
        return prefer.includes("return=representation") ? json(201, written.map(pick)) : json(201, null);
      }
      if (method === "PATCH") { for (const r of rows.filter(sel)) Object.assign(r, body); return json(204, null); }
      if (method === "DELETE") { const keep = rows.filter((r) => !sel(r)); rows.length = 0; rows.push(...keep); return json(204, null); }
      return json(405, {});
    },
  };
}

function csv(dir) {
  const f = path.join(dir, "pins.csv");
  fs.writeFileSync(f, [
    "id,name,series,origin,edition,release_year,cover_image,url,series_url,added_at",
    "1,Stitch Surfing,Lilo & Stitch Beach,Disneyland Paris,LE 300,2015,https://cdn.example/1.jpg,https://pinandpop.example/pins/1,https://pinandpop.example/series/beach,2025-01-01",
    "2,Mickey Mouse,Lilo & Stitch Beach,Disneyland Paris,OE,2015,https://cdn.example/2.jpg,https://pinandpop.example/pins/2,https://pinandpop.example/series/beach,2025-01-01",
    "3,Minnie,,Walt Disney World,LR,2016,,https://pinandpop.example/pins/3,,2025-01-01",
  ].join("\n"));
  return f;
}
const quiet = () => {};

test("guard refuses anything that isn't production", async () => {
  assert.throws(() => assertProductionTarget({ ...env, PINHUNT_ENV: "staging" }), /PINHUNT_ENV/);
  assert.throws(() => assertProductionTarget({ ...env, SUPABASE_URL: `https://${STAGING}.supabase.co` }), /SUPABASE_URL/);
  assert.throws(() => assertProductionTarget({ ...env, STAGING_PROJECT_REF: PROD }), /same as STAGING/);
  await assert.rejects(main(["check"], env, { fetchImpl: fakeSupabase({ environment: "staging" }).fetch, log: quiet }), /says it is "staging"/);
  await assert.rejects(main(["check"], env, { fetchImpl: fakeSupabase({ stagingBucket: true }).fetch, log: quiet }), /staging marker bucket/);
});

test("check and dry runs write nothing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnp-"));
  const fake = fakeSupabase();
  await main(["check", "--csv", csv(dir)], env, { fetchImpl: fake.fetch, log: quiet });
  await main(["import", "--csv", csv(dir)], env, { fetchImpl: fake.fetch, log: quiet });
  assert.ok(fake.log.every((r) => r.method === "GET" || r.method === "HEAD"), "only reads");
});

test("import writes Pin & Pop pins exactly as staging's importer would, only after the typed confirmation", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnp-"));
  const oldPin = { id: "old-1", pinhunt_id: "PHUK-00013002", title: "Old", catalogue_source: "collectible_pintrader" };
  const fake = fakeSupabase({ seed: { pins: [oldPin] } });
  await assert.rejects(main(["import", "--csv", csv(dir), "--apply"], env, { fetchImpl: fake.fetch, log: quiet, confirm: async () => { throw new Error("confirmation didn't match"); } }), /didn't match/);
  assert.equal(fake.tables.pins.length, 1, "nothing written without confirmation");

  let asked = null;
  const out = await main(["import", "--csv", csv(dir), "--apply"], env, { fetchImpl: fake.fetch, log: quiet, confirm: async (ref, what) => { asked = { ref, what }; } });
  assert.deepEqual(asked, { ref: PROD, what: "import 3 Pin & Pop pins" });
  const pnp = fake.tables.pins.filter((p) => p.catalogue_source === "pin_and_pop");
  assert.deepEqual(pnp.map((p) => p.pinhunt_id).sort(), ["PHUK-10000001", "PHUK-10000002", "PHUK-10000003"]);
  assert.ok(pnp.every((p) => p.image_url === null && p.verification_status === "verified"), "no public photo (licence)");
  assert.equal(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-00013002").title, "Old", "old pins untouched");
  assert.equal(fake.tables.pin_sets.length, 1);
  assert.equal(fake.tables.pin_sets[0].released_pin_count, 2);
  assert.equal(fake.tables.pin_set_memberships.length, 2);
  assert.equal(fake.tables.pin_external_ids.length, 3);
  const refs = fake.tables.pin_images.filter((i) => i.source === "pin_and_pop");
  assert.equal(refs.length, 2, "reference images for pins that have one");
  assert.ok(refs.every((i) => i.public_display_allowed === false && i.uploaded_by === null));
  const src = fake.tables.catalogue_sources.find((s) => s.id === "pin_and_pop");
  assert.equal(src.attribution_text, "Pin data provided by Pin & Pop (pinandpop.com)");
  assert.equal(src.public_display_allowed, false);
  assert.equal(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000001").main_character, "Stitch", "characters filled as on staging");
  assert.equal(out.after.pinAndPopPins, 3);

  // Re-running is idempotent: no duplicates.
  await main(["import", "--csv", csv(dir), "--apply"], env, { fetchImpl: fake.fetch, log: quiet, confirm: async () => {} });
  assert.equal(fake.tables.pins.filter((p) => p.catalogue_source === "pin_and_pop").length, 3);
  assert.equal(fake.tables.pin_images.filter((i) => i.source === "pin_and_pop").length, 2);
  assert.equal(fake.tables.pin_external_ids.length, 3);
  assert.ok(!fake.log.some((r) => r.method === "DELETE" && r.path === "/rest/v1/pins"), "never deletes pins");
});

test("refuses when an old pin already uses a Pin & Pop PinHunt ID", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnp-"));
  const fake = fakeSupabase({ seed: { pins: [{ id: "x", pinhunt_id: "PHUK-10000002", title: "Random old id", catalogue_source: "collectible_pintrader" }] } });
  await assert.rejects(main(["import", "--csv", csv(dir), "--apply"], env, { fetchImpl: fake.fetch, log: quiet, confirm: async () => {} }), /already use a Pin & Pop PinHunt ID/);
  assert.equal(fake.tables.pins.length, 1);
});

test("production migration copies differ from the originals only in the guard, and are up to date", async () => {
  const { SOURCES, OUT_DIR, productionCopy, STAGING_GUARD, PRODUCTION_GUARD } = await import("./build-production-migrations.mjs");
  const root = new URL("../../", import.meta.url);
  for (const name of SOURCES) {
    const original = fs.readFileSync(new URL(`supabase/migrations/${name}`, root), "utf8");
    const committed = fs.readFileSync(new URL(OUT_DIR + name.replace(/\.sql$/, ".PRODUCTION.sql"), root), "utf8");
    assert.equal(committed, productionCopy(name, original), `${name}: run node scripts/catalogue-gap/build-production-migrations.mjs`);
    const body = committed.slice(committed.indexOf("\n\n") + 2);
    assert.equal(body.replace(PRODUCTION_GUARD, STAGING_GUARD), original, `${name}: only the guard may differ`);
  }
});

/** A fake Pin & Pop API client: serves the given items in pages of 2. */
function fakePinAndPop(items) {
  return () => ({
    requestCount: 0,
    async *pages({ idAfter = null } = {}) {
      const list = items.filter((i) => idAfter == null || i.id > idAfter);
      for (let i = 0; i < list.length; i += 2) { this.requestCount++; yield { items: list.slice(i, i + 2), hasMore: i + 2 < list.length }; }
    },
  });
}
const item = (id, name, extra = {}) => ({ id, name, series: "Beach", origin: "Disneyland Paris", edition: "LE 300", release_year: 2015, cover_image: `https://cdn.example/${id}.jpg`, url: `https://pinandpop.example/pins/${id}`, series_url: "https://pinandpop.example/series/beach", added_at: "2025-01-01", ...extra });

test("scheduled (unattended) sync: only sync modes, only with the production ref in its environment", async () => {
  const withToken = { ...env, PINANDPOP_API_TOKEN: "t" };
  const fake = fakeSupabase();
  const deps = { fetchImpl: fake.fetch, log: quiet, confirm: async () => { throw new Error("must not ask"); }, pinAndPopClient: fakePinAndPop([item(1, "Stitch Surfing")]) };
  await assert.rejects(main(["sync", "--apply", "--unattended"], withToken, deps), /PINHUNT_UNATTENDED_CONFIRM/);
  await assert.rejects(main(["sync", "--apply", "--unattended"], { ...withToken, PINHUNT_UNATTENDED_CONFIRM: STAGING }, deps), /PINHUNT_UNATTENDED_CONFIRM/);
  await assert.rejects(main(["characters", "--apply", "--unattended"], { ...withToken, PINHUNT_UNATTENDED_CONFIRM: PROD }, deps), /only allowed for sync/);
  assert.equal(fake.tables.pins.length, 0, "nothing written by refused runs");

  await main(["sync", "--apply", "--unattended"], { ...withToken, PINHUNT_UNATTENDED_CONFIRM: PROD }, deps);
  assert.deepEqual(fake.tables.pins.map((p) => p.pinhunt_id), ["PHUK-10000001"]);
  // Without --unattended the typed confirmation is still required.
  await assert.rejects(main(["sync", "--apply"], { ...withToken, PINHUNT_UNATTENDED_CONFIRM: PROD }, deps), /must not ask/);
});

test("full refresh: edits land, removed pins are archived (never deleted), and a short API answer archives nothing", async () => {
  const withToken = { ...env, PINANDPOP_API_TOKEN: "t", PINHUNT_UNATTENDED_CONFIRM: PROD };
  const fake = fakeSupabase();
  const all = Array.from({ length: 10 }, (_, i) => item(i + 1, `Pin ${i + 1}`));
  await main(["sync", "--apply", "--unattended"], withToken, { fetchImpl: fake.fetch, log: quiet, pinAndPopClient: fakePinAndPop(all) });
  assert.equal(fake.tables.pins.length, 10);

  // A Collectible PinTrader photo linked to pin 4 (as the move-and-clean step did).
  const ctp = `https://${PROD}.supabase.co/storage/v1/object/public/pin-catalogue/collectible-pintrader/4.jpg`;
  Object.assign(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000004"), { image_url: ctp, needs_front_image: false });

  // Pin 3 renamed, pin 10 removed by Pin & Pop.
  const next = all.filter((i) => i.id !== 10).map((i) => (i.id === 3 ? { ...i, name: "Pin 3 renamed" } : i));
  const dry = await main(["sync", "--full"], withToken, { fetchImpl: fake.fetch, log: quiet, pinAndPopClient: fakePinAndPop(next) });
  assert.equal(dry.stats.noLongerReturned, 1);
  assert.equal(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000003").title, "Pin 3", "dry run writes nothing");

  await main(["sync", "--full", "--apply", "--unattended"], withToken, { fetchImpl: fake.fetch, log: quiet, pinAndPopClient: fakePinAndPop(next) });
  assert.equal(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000003").title, "Pin 3 renamed");
  const four = fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000004");
  assert.equal(four.image_url, ctp, "a refresh never blanks a linked photo");
  assert.equal(four.needs_front_image, false);
  assert.equal(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000005").needs_front_image, true);
  const gone = fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000010");
  assert.equal(gone.catalogue_status, "archived");
  assert.equal(gone.is_searchable, false);
  assert.equal(fake.tables.pins.length, 10, "never deletes");

  // A partial answer (5 of 9 live pins) must not archive anything.
  await assert.rejects(main(["sync", "--full", "--apply", "--unattended"], withToken, { fetchImpl: fake.fetch, log: quiet, pinAndPopClient: fakePinAndPop(next.slice(0, 5)) }), /under 90%/);
  assert.equal(fake.tables.pins.filter((p) => p.catalogue_status === "archived").length, 1);
});

test("scheduled daily run: new pins every day, full re-read only on Sundays (UTC)", async () => {
  const withToken = { ...env, PINANDPOP_API_TOKEN: "t", PINHUNT_UNATTENDED_CONFIRM: PROD };
  const fake = fakeSupabase();
  const all = Array.from({ length: 4 }, (_, i) => item(i + 1, `Pin ${i + 1}`));
  const run = (items, day) => main(["sync", "--apply", "--unattended", "--full-on-sunday"], withToken, {
    fetchImpl: fake.fetch, log: quiet, pinAndPopClient: fakePinAndPop(items), now: () => new Date(`2026-11-${day}T03:17:00Z`),
  });
  await run(all, "16"); // Monday
  assert.equal(fake.tables.pins.length, 4);
  const renamed = [...all.map((i) => (i.id === 2 ? { ...i, name: "Pin 2 renamed" } : i)), item(5, "Pin 5")];
  await run(renamed, "17"); // Tuesday: the new pin arrives, the edit waits for Sunday
  assert.equal(fake.tables.pins.length, 5);
  assert.equal(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000002").title, "Pin 2");
  await run(renamed, "22"); // Sunday
  assert.equal(fake.tables.pins.find((p) => p.pinhunt_id === "PHUK-10000002").title, "Pin 2 renamed");
});

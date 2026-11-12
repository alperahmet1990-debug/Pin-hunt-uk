/**
 * Pin & Pop catalogue: field mapping, CSV parsing, API client and database
 * writer. Shared by scripts/import-pinandpop.mjs (CSV seed, full refresh) and
 * the admin sync route (src/routes/pinandpop-sync.ts).
 *
 * Licence (Pin & Pop Data & Image License Agreement v1.3):
 *  - Visible attribution: PINANDPOP_ATTRIBUTION, shown wherever P&P data is.
 *  - cover_image may never be shown publicly. It is stored only as an
 *    admin/scan reference pin_images row (public_display_allowed = false,
 *    enforced by the 042 check constraint). pins.image_url is never set from it.
 *  - No redistribution of the dataset: nothing here exports it.
 *
 * Identity: pinhunt_id is derived from the Pin & Pop id
 * (PHUK-1xxxxxxx = 10,000,000 + P&P id). It never changes, re-runs are
 * idempotent, and it can't collide with ids minted by next_pinhunt_id(),
 * which are far below 10,000,000.
 */

import { charactersForPin } from "./pinandpop-characters.mjs";

export const PINANDPOP_SOURCE = "pin_and_pop";
export const PINANDPOP_ATTRIBUTION = "Pin data provided by Pin & Pop (pinandpop.com)";
export const PINANDPOP_API_BASE = "https://pinandpop.com/api/v1";
export const PINHUNT_ID_OFFSET = 10_000_000;
const SET_KEY_PREFIX = "pin_and_pop | ";

// ── identity ────────────────────────────────────────────────────────────────

export function pinhuntIdFor(ppId) {
  const n = Number(ppId);
  if (!Number.isInteger(n) || n <= 0 || n >= PINHUNT_ID_OFFSET) throw new Error(`invalid Pin & Pop id: ${ppId}`);
  return `PHUK-${String(PINHUNT_ID_OFFSET + n).padStart(8, "0")}`;
}

/** PHUK-10012345 → 12345; anything not in the Pin & Pop range → null. */
export function ppIdFromPinhuntId(pinhuntId) {
  const m = /^PHUK-(\d{8})$/.exec(String(pinhuntId ?? ""));
  if (!m) return null;
  const n = Number(m[1]) - PINHUNT_ID_OFFSET;
  return n > 0 ? n : null;
}

// ── field mapping ───────────────────────────────────────────────────────────

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length ? s : null;
};

/** "OE" | "LR" | "LE" | "LE 300" | null → edition_type + limited_edition_size. */
export function parseEdition(code) {
  const c = clean(code);
  if (!c) return { edition_type: null, limited_edition_size: null };
  const up = c.toUpperCase();
  if (up === "OE") return { edition_type: "Open Edition", limited_edition_size: null };
  if (up === "LR") return { edition_type: "Limited Release", limited_edition_size: null };
  const le = /^LE(?:\s+([\d,]+))?$/.exec(up);
  if (le) {
    const size = le[1] ? Number(le[1].replace(/,/g, "")) : null;
    return { edition_type: "Limited Edition", limited_edition_size: Number.isFinite(size) && size > 0 ? size : null };
  }
  return { edition_type: c, limited_edition_size: null };
}

/** https://pinandpop.com/series/<slug> → <slug>; otherwise null. */
export function seriesSlug(seriesUrl) {
  const m = /\/series\/([^/?#]+)\/?$/.exec(String(seriesUrl ?? "").trim());
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

export const setKeyFor = (slug) => (slug ? SET_KEY_PREFIX + slug : null);

function parseYear(v) {
  const s = clean(v);
  if (!s || !/^\d{4}$/.test(s)) return null;
  const y = Number(s);
  return y >= 1950 && y <= 2100 ? y : null;
}

/** "2024-06-14T10:22:01.000000Z" or "2018-09-23 20:49:13" (UTC) → ISO string | null. */
function parseAddedAt(v) {
  const s = clean(v);
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(" ", "T") + "Z" : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * One CSV row or API item → normalised record, or { problem } when it can't
 * be imported. The same function handles both sources so they stay identical.
 */
export function normalisePinAndPop(raw) {
  const id = Number(String(raw?.id ?? "").trim());
  if (!Number.isInteger(id) || id <= 0) return { problem: "invalid id" };
  const name = clean(raw.name);
  if (!name) return { problem: "missing name", id };
  const slug = seriesSlug(raw.series_url);
  return {
    id,
    name,
    series: clean(raw.series),
    seriesSlug: slug,
    seriesUrl: clean(raw.series_url),
    origin: clean(raw.origin),
    edition: clean(raw.edition),
    releaseYear: parseYear(raw.release_year),
    coverImage: clean(raw.cover_image),
    url: clean(raw.url),
    addedAt: parseAddedAt(raw.added_at),
  };
}

/** Normalised record → pins row (upsert on pinhunt_id). */
export function toPinRow(p, now = new Date().toISOString()) {
  const { edition_type, limited_edition_size } = parseEdition(p.edition);
  return {
    pinhunt_id: pinhuntIdFor(p.id),
    title: p.name,
    brand: "Disney",
    // NOT NULL column; "" makes the app fall back to "Uncategorised".
    collection: p.series ?? "",
    normalised_series: setKeyFor(p.seriesSlug),
    origin: p.origin,
    retailer: p.origin,
    edition_type,
    limited_edition_size,
    release_year: p.releaseYear,
    image_url: null, // licence: cover images are never public
    source_url: p.url,
    external_identifiers: { [PINANDPOP_SOURCE]: String(p.id) },
    verification_status: "verified",
    status: "active",
    catalogue_status: "active",
    is_searchable: true,
    archived_at: null,
    catalogue_source: PINANDPOP_SOURCE,
    catalogue_updated_at: now,
    is_seed_record: false,
    is_user_submitted: false,
    needs_front_image: true,
    raw_import_data: {
      source: PINANDPOP_SOURCE,
      id: p.id,
      name: p.name,
      series: p.series,
      series_url: p.seriesUrl,
      origin: p.origin,
      edition: p.edition,
      release_year: p.releaseYear,
      url: p.url,
      added_at: p.addedAt,
    },
  };
}

/** Normalised records of one series → pin_sets row (upsert on normalised_series). */
export function toSetRow(members) {
  const first = members[0];
  const years = members.map((m) => m.releaseYear).filter((y) => y != null);
  return {
    normalised_series: setKeyFor(first.seriesSlug),
    set_name: first.series ?? first.seriesSlug,
    original_source_name: first.series,
    release_year: years.length ? Math.min(...years) : null,
    released_pin_count: members.length,
    source_url: first.seriesUrl,
    source_record_id: first.seriesSlug,
    catalogue_source: PINANDPOP_SOURCE,
    is_legacy_v1: false,
  };
}

/** Reference-only image row: admin review and scan matching, never public. */
export function toReferenceImageRow(pinUuid, p) {
  if (!p.coverImage) return null;
  return {
    pin_id: pinUuid,
    image_url: p.coverImage,
    image_type: "reference",
    source: PINANDPOP_SOURCE,
    source_record_id: String(p.id),
    status: "approved",
    public_display_allowed: false,
    attribution_required: true,
    is_primary: false,
    uploaded_by: null,
    description: "Pin & Pop reference image (internal use only, licence v1.3)",
  };
}

// ── CSV (RFC 4180: quoted fields, "" escapes, newlines inside quotes) ─────────

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  const cols = header.map((h) => h.replace(/^﻿/, "").trim());
  return body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ""])));
}

export const PINANDPOP_CSV_COLUMNS = ["id", "name", "series", "origin", "edition", "release_year", "cover_image", "url", "series_url", "added_at"];

// ── API client: bearer auth, ≤60 req/min, retries with backoff ──────────────

export class PinAndPopApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {{ token: string, fetchImpl?: typeof fetch, minIntervalMs?: number,
 *           maxRetries?: number, sleep?: (ms:number)=>Promise<void>, now?: ()=>number,
 *           baseUrl?: string, timeoutMs?: number }} opts
 */
export function createPinAndPopClient(opts) {
  const {
    token,
    fetchImpl = globalThis.fetch,
    minIntervalMs = 1000, // documented limit is 60/min
    maxRetries = 5,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => Date.now(),
    baseUrl = PINANDPOP_API_BASE,
    timeoutMs = 30_000,
  } = opts;
  if (!token) throw new PinAndPopApiError("PINANDPOP_API_TOKEN is not set", 0);
  let nextSlot = 0;
  let requests = 0;

  async function throttle() {
    const t = now();
    if (t < nextSlot) await sleep(nextSlot - t);
    nextSlot = Math.max(t, nextSlot) + minIntervalMs;
  }

  async function getJson(pathAndQuery) {
    for (let attempt = 0; ; attempt++) {
      await throttle();
      requests++;
      let res;
      try {
        res = await fetchImpl(baseUrl + pathAndQuery, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "PinHunt-catalogue-sync/1.0" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (attempt >= maxRetries) throw new PinAndPopApiError(`network error: ${err?.message ?? err}`, 0);
        await sleep(Math.min(2 ** attempt * 1000, 30_000));
        continue;
      }
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) throw new PinAndPopApiError(`Pin & Pop API ${res.status} after ${attempt + 1} attempts`, res.status);
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = res.status === 429
          ? (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000)
          : Math.min(2 ** attempt * 1000, 30_000);
        await sleep(wait);
        continue;
      }
      // 401 bad token, 403 missing pins:read, 404, 422 bad params: not retryable.
      const body = await res.text().catch(() => "");
      throw new PinAndPopApiError(`Pin & Pop API ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
  }

  /** Yields pages of raw items, sorted by id ascending, following next_cursor. */
  async function* pages({ idAfter = null, perPage = 200, maxPages = Infinity } = {}) {
    const q = new URLSearchParams({ per_page: String(perPage) });
    if (idAfter != null) q.set("id_after", String(idAfter));
    let path = `/pins?${q}`;
    for (let n = 0; n < maxPages; n++) {
      const body = await getJson(path);
      const data = Array.isArray(body?.data) ? body.data : [];
      const cursor = body?.meta?.next_cursor ?? null;
      yield { items: data, hasMore: Boolean(cursor) };
      if (!cursor) return;
      const next = new URLSearchParams({ per_page: String(perPage), cursor });
      if (idAfter != null) next.set("id_after", String(idAfter));
      path = `/pins?${next}`;
    }
  }

  return { getJson, pages, getPin: (id) => getJson(`/pins/${Number(id)}`), get requestCount() { return requests; } };
}

// ── database writer (service-role supabase client) ──────────────────────────

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/** Highest Pin & Pop id already stored (pinhunt_id is zero-padded, so text order = numeric order). */
export async function highestStoredPinAndPopId(supabase) {
  const rows = await must(
    supabase.from("pins").select("pinhunt_id").eq("catalogue_source", PINANDPOP_SOURCE)
      .order("pinhunt_id", { ascending: false }).limit(1),
    "read highest id",
  );
  return rows?.length ? ppIdFromPinhuntId(rows[0].pinhunt_id) : null;
}

/** Makes sure the catalogue_sources row carries the licence terms (images stay private). */
export async function ensurePinAndPopSource(supabase) {
  await must(supabase.from("catalogue_sources").upsert({
    id: PINANDPOP_SOURCE,
    display_name: "Pin & Pop",
    attribution_text: PINANDPOP_ATTRIBUTION,
    rights_basis: "Pin & Pop Data & Image License Agreement v1.3 (API + Images + Data tier)",
    exact_license_variant: "v1.3",
    public_display_allowed: false,
    storage_allowed: false,
    app_use_allowed: true,
    attribution_required: true,
    notes: "Pin data may be shown with visible attribution. cover_image URLs are internal only (admin review, scan matching); never shown publicly, never copied to storage. No redistribution of the dataset.",
  }, { onConflict: "id" }), "update catalogue_sources");
}

/**
 * Upserts normalised records: pins, sets, set memberships, external ids and
 * reference images. Idempotent. Returns counts.
 */
export async function writePinAndPopBatch(supabase, records, { now = new Date().toISOString(), batchSize = 500, fresh = false } = {}) {
  // Filters like .in("pin_id", [...]) go in the URL: keep each one well under ~8 KB.
  const IN_CHUNK = 150;
  const stats = { pins: 0, sets: 0, memberships: 0, externalIds: 0, images: 0 };
  if (!records.length) return stats;

  // Sets first, so memberships can reference them.
  const bySet = new Map();
  for (const r of records) if (r.seriesSlug) (bySet.get(r.seriesSlug) ?? bySet.set(r.seriesSlug, []).get(r.seriesSlug)).push(r);
  const setIds = new Map();
  for (const group of chunk([...bySet.values()], 80)) {
    const keys = group.map((g) => setKeyFor(g[0].seriesSlug));
    // released_pin_count must count every member, not just this batch: merge with what's stored.
    const existing = await must(supabase.from("pin_sets").select("normalised_series").in("normalised_series", keys), "read sets");
    const known = new Set((existing ?? []).map((s) => s.normalised_series));
    const rows = group.map((g) => {
      const row = toSetRow(g);
      if (known.has(row.normalised_series)) delete row.released_pin_count; // recounted below
      return row;
    });
    const fresh = rows.filter((r) => !known.has(r.normalised_series));
    const stale = rows.filter((r) => known.has(r.normalised_series));
    if (fresh.length) await must(supabase.from("pin_sets").upsert(fresh, { onConflict: "normalised_series" }), "upsert sets");
    for (const r of stale) {
      await must(supabase.from("pin_sets").update(r).eq("normalised_series", r.normalised_series), "update set");
    }
    const ids = await must(supabase.from("pin_sets").select("id, normalised_series").in("normalised_series", keys), "read set ids");
    for (const s of ids ?? []) setIds.set(s.normalised_series, s.id);
    stats.sets += group.length;
  }

  for (const part of chunk(records, batchSize)) {
    const pinRows = part.map((r) => toPinRow(r, now));
    const saved = await must(
      supabase.from("pins").upsert(pinRows, { onConflict: "pinhunt_id" }).select("id, pinhunt_id"),
      "upsert pins",
    );
    const uuidByPh = new Map(saved.map((s) => [s.pinhunt_id, s.id]));
    const uuids = [...uuidByPh.values()];
    stats.pins += saved.length;

    // Memberships: replace (a pin's series can change). Pin & Pop pins only
    // belong to Pin & Pop sets, so clearing all of their memberships is safe.
    if (!fresh) {
      for (const ids of chunk(uuids, IN_CHUNK)) {
        await must(supabase.from("pin_set_memberships").delete().in("pin_id", ids), "clear memberships");
      }
    }
    const memberships = part
      .filter((r) => r.seriesSlug && setIds.has(setKeyFor(r.seriesSlug)))
      .map((r) => ({ pin_id: uuidByPh.get(pinhuntIdFor(r.id)), set_id: setIds.get(setKeyFor(r.seriesSlug)) }))
      .filter((m) => m.pin_id);
    if (memberships.length) {
      await must(supabase.from("pin_set_memberships").upsert(memberships, { onConflict: "pin_id,set_id", ignoreDuplicates: true }), "insert memberships");
    }
    stats.memberships += memberships.length;

    const ext = part.map((r) => ({ pin_id: uuidByPh.get(pinhuntIdFor(r.id)), source: PINANDPOP_SOURCE, external_id: String(r.id) }))
      .filter((e) => e.pin_id);
    await must(supabase.from("pin_external_ids").upsert(ext, { onConflict: "source,external_id" }), "upsert external ids");
    stats.externalIds += ext.length;

    // Reference images: replace (the partial unique index can't be an upsert target).
    if (!fresh) {
      for (const ids of chunk(uuids, IN_CHUNK)) {
        await must(supabase.from("pin_images").delete().in("pin_id", ids).eq("source", PINANDPOP_SOURCE), "clear reference images");
      }
    }
    const imgs = part.map((r) => toReferenceImageRow(uuidByPh.get(pinhuntIdFor(r.id)), r)).filter((i) => i?.pin_id);
    if (imgs.length) await must(supabase.from("pin_images").insert(imgs), "insert reference images");
    stats.images += imgs.length;
  }
  return stats;
}

/** Recomputes released_pin_count for the given Pin & Pop set keys from memberships. */
export async function recountSets(supabase, setKeys) {
  for (const key of setKeys) {
    const sets = await must(supabase.from("pin_sets").select("id").eq("normalised_series", key).limit(1), "read set");
    if (!sets?.length) continue;
    const { count, error } = await supabase.from("pin_set_memberships").select("pin_id", { count: "exact", head: true }).eq("set_id", sets[0].id);
    if (error) throw new Error(`count members: ${error.message}`);
    await must(supabase.from("pin_sets").update({ released_pin_count: count ?? 0 }).eq("id", sets[0].id), "update set count");
  }
}

/**
 * Sets released_pin_count from known member counts (key → count), touching
 * only sets whose stored count differs. Used after a whole-catalogue pass.
 */
export async function syncSetCounts(supabase, countsByKey) {
  let updated = 0;
  for (let from = 0; ; from += 1000) {
    const page = await must(
      supabase.from("pin_sets").select("id, normalised_series, released_pin_count").eq("catalogue_source", PINANDPOP_SOURCE)
        .order("normalised_series").range(from, from + 999),
      "read set counts",
    );
    for (const s of page) {
      const want = countsByKey.get(s.normalised_series) ?? 0;
      if (s.released_pin_count !== want) {
        await must(supabase.from("pin_sets").update({ released_pin_count: want }).eq("id", s.id), "update set count");
        updated++;
      }
    }
    if (page.length < 1000) break;
  }
  return updated;
}

/**
 * Fills character columns from pin names (pinandpop-characters.mjs) for
 * Pin & Pop pins. Only pins whose characters are blank or were set by this
 * matcher (character_review_status 'auto_matched') are touched, so a person's
 * edits are never overwritten; re-running after the character list improves
 * updates the automatic ones. `pinhuntIds` limits it to those pins (sync);
 * without it every Pin & Pop pin is checked. Returns counts.
 */
export async function fillCharacters(supabase, { pinhuntIds = null, apply = true, log = () => {} } = {}) {
  const stats = { checked: 0, matched: 0, changed: 0, skippedManual: 0 };
  const rows = [];
  const columns = "pinhunt_id, title, brand, collection, main_character, all_characters, character_review_status";
  if (pinhuntIds) {
    for (const ids of chunk(pinhuntIds, 150)) {
      rows.push(...(await must(supabase.from("pins").select(columns).in("pinhunt_id", ids), "read pins for characters")));
    }
  } else {
    for (let from = 0; ; from += 1000) {
      const page = await must(
        supabase.from("pins").select(columns).eq("catalogue_source", PINANDPOP_SOURCE).order("pinhunt_id").range(from, from + 999),
        "read pins for characters",
      );
      rows.push(...page);
      if (page.length < 1000) break;
    }
  }
  const updates = [];
  for (const r of rows) {
    stats.checked++;
    const status = r.character_review_status;
    const manual = status && status !== "auto_matched" || (!status && (r.main_character || r.all_characters));
    if (manual) { stats.skippedManual++; continue; }
    const c = charactersForPin(r.title, r.collection);
    if (c) stats.matched++;
    const next = c ?? { main_character: null, all_characters: null, character_confidence: null, character_review_status: null };
    if (next.main_character === r.main_character && next.all_characters === r.all_characters && next.character_review_status === status) continue;
    // NOT NULL columns ride along so the upsert's insert half is valid; it only ever updates.
    updates.push({ pinhunt_id: r.pinhunt_id, title: r.title, brand: r.brand, collection: r.collection, ...next });
  }
  stats.changed = updates.length;
  if (apply) {
    // 250 a request: each row also updates the character trigram indexes (075),
    // and 1,000 at once once hit the statement timeout on staging.
    for (const part of chunk(updates, 250)) {
      await must(supabase.from("pins").upsert(part, { onConflict: "pinhunt_id" }), "write characters");
      log(`characters: ${part.length} pins updated`);
    }
  }
  return stats;
}

/**
 * Incremental sync: pins with id > highest stored id. Stops after maxPages
 * (200 pins each) so a request-bound caller stays inside its time budget; the
 * next run carries on from the new highest id.
 */
export async function syncNewPins({ supabase, client, maxPages = Infinity, log = () => {} }) {
  await ensurePinAndPopSource(supabase);
  const start = await highestStoredPinAndPopId(supabase);
  const stats = { startedAfterId: start, fetched: 0, written: 0, skipped: [], highestId: start, complete: false, requests: 0 };
  const touchedSets = new Set();
  for await (const page of client.pages({ idAfter: start, maxPages })) {
    const recs = [];
    for (const item of page.items) {
      const r = normalisePinAndPop(item);
      if (r.problem) stats.skipped.push({ id: item?.id ?? null, problem: r.problem });
      else recs.push(r);
    }
    stats.fetched += page.items.length;
    const res = await writePinAndPopBatch(supabase, recs);
    stats.written += res.pins;
    for (const r of recs) {
      if (r.seriesSlug) touchedSets.add(setKeyFor(r.seriesSlug));
      if (stats.highestId == null || r.id > stats.highestId) stats.highestId = r.id;
    }
    log(`page: ${page.items.length} fetched, highest id ${stats.highestId}`);
    if (!page.hasMore) stats.complete = true;
  }
  await recountSets(supabase, touchedSets);
  stats.requests = client.requestCount;
  if (stats.written > 0) {
    // Characters for the pins this run added (all Pin & Pop pins if the catalogue was empty).
    let newIds = null;
    if (start != null) {
      newIds = [];
      for (let id = start + 1; id <= (stats.highestId ?? start); id++) newIds.push(pinhuntIdFor(id));
    }
    stats.characters = await fillCharacters(supabase, { pinhuntIds: newIds, log });
  }
  return stats;
}

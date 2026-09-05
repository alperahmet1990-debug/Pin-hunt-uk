/**
 * Showcase account seed — populates ONE existing admin account with a
 * realistic Catalogue V2 collection for demoing/testing PinHunt.
 *
 * Scope: writes ONLY to `user_pins` for the resolved user id, using only
 * real Catalogue V2 pins (catalogue_source='collectible_pintrader'). No
 * fake pins, no other accounts touched, no trades/messages fabricated.
 *
 * Idempotent: upserts on (user_id, pin_id) — safe to re-run. Every row it
 * creates/updates in this run is recorded in a JSON manifest file for later
 * removal, rather than adding a schema-level tag column.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-showcase-account.mjs --dry-run
 *   node --env-file=.env scripts/seed-showcase-account.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const USER_ID = "fcbcf74e-4ff6-4dba-b11a-373ee8e4bfb9"; // alperahmet1990@gmail.com, confirmed admin

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function shuffle(arr, seed = 42) {
  const a = [...arr];
  let s = seed;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

async function main() {
  const pins = await fetchAll(
    "pins",
    "id, pinhunt_id, title, origin, release_year, edition_type, limited_edition_size, retail_price, image_url",
    (q) => q.eq("catalogue_source", "collectible_pintrader")
  );
  const pinById = new Map(pins.map((p) => [p.id, p]));

  const sets = await fetchAll("pin_sets", "id, set_name", (q) => q.eq("catalogue_source", "collectible_pintrader"));
  const setById = new Map(sets.map((s) => [s.id, s]));
  const memberships = await fetchAll("pin_set_memberships", "pin_id, set_id");
  const membersBySet = new Map();
  for (const m of memberships) {
    if (!membersBySet.has(m.set_id)) membersBySet.set(m.set_id, []);
    membersBySet.get(m.set_id).push(m.pin_id);
  }

  // ── Choose 7 showcase sets with a spread of sizes for varied completion tiers ──
  const setSizes = [...membersBySet.entries()]
    .map(([id, pinIds]) => ({ id, name: setById.get(id)?.set_name, pinIds, size: pinIds.length }))
    .filter((s) => s.name);

  const smallSets = shuffle(setSizes.filter((s) => s.size >= 3 && s.size <= 6), 1);
  const midSets = shuffle(setSizes.filter((s) => s.size >= 8 && s.size <= 20), 2);
  const bigSets = shuffle(setSizes.filter((s) => s.size >= 15 && s.size <= 40), 3);

  const chosen = [
    { ...bigSets[0], tier: "completed", targetPct: 1.0 },
    { ...bigSets[1], tier: "70-90%", targetPct: 0.8 },
    { ...midSets[0], tier: "70-90%", targetPct: 0.85 },
    { ...midSets[1], tier: "40-60%", targetPct: 0.5 },
    { ...midSets[2], tier: "40-60%", targetPct: 0.45 },
    { ...smallSets[0], tier: "few-owned", targetPct: 0.34 },
    { ...smallSets[1], tier: "few-owned", targetPct: 0.34 },
  ].filter((s) => s.id);

  const ownedFromSets = new Set();
  const wishlistFromSets = new Set();
  const setPlan = [];
  for (const s of chosen) {
    const memberIds = shuffle(s.pinIds, s.id.charCodeAt(0));
    const ownCount = Math.max(1, Math.round(memberIds.length * s.targetPct));
    const owned = memberIds.slice(0, ownCount);
    const missing = memberIds.slice(ownCount);
    owned.forEach((id) => ownedFromSets.add(id));
    missing.slice(0, 4).forEach((id) => wishlistFromSets.add(id));
    setPlan.push({ setId: s.id, name: s.name, tier: s.tier, totalMembers: memberIds.length, owned: owned.length, missingSample: missing.length });
  }

  // ── Fill remaining owned slots with varied picks (strong images/metadata favoured) ──
  const scored = pins
    .filter((p) => !ownedFromSets.has(p.id))
    .map((p) => ({
      p,
      score: (p.retail_price != null ? 2 : 0) + (p.limited_edition_size != null ? 1 : 0) + (p.release_year != null ? 1 : 0),
    }));
  const variedPool = shuffle(scored, 7)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);

  const targetOwnedTotal = 85;
  const additionalNeeded = Math.max(0, targetOwnedTotal - ownedFromSets.size);
  const seenOrigins = new Set();
  const additionalOwned = [];
  for (const p of variedPool) {
    if (additionalOwned.length >= additionalNeeded) break;
    additionalOwned.push(p.id);
  }

  const ownedPinIds = [...new Set([...ownedFromSets, ...additionalOwned])];

  // ── Duplicates: ~15 owned pins get quantity 2 ──
  const dupPicks = new Set(shuffle(ownedPinIds, 11).slice(0, 15));

  // ── Favourites: ~12 owned pins, prefer ones with images/complete metadata ──
  const favouritePicks = new Set(
    shuffle(ownedPinIds, 13)
      .map((id) => pinById.get(id))
      .filter(Boolean)
      .sort((a, b) => (b.retail_price != null ? 1 : 0) - (a.retail_price != null ? 1 : 0))
      .slice(0, 12)
      .map((p) => p.id)
  );

  // ── Wishlist: missing pins from partial sets + desirable LE pins, not already owned ──
  const ownedSet = new Set(ownedPinIds);
  const leExtras = shuffle(
    pins.filter((p) => !ownedSet.has(p.id) && !wishlistFromSets.has(p.id) && p.edition_type === "Limited Edition"),
    17
  ).slice(0, 12);
  const wishlistPinIds = [...new Set([...wishlistFromSets, ...leExtras.map((p) => p.id)])].slice(0, 22).filter((id) => !ownedSet.has(id));

  // ── For Trade: separate pins from owned/wishlist, distinct status ──
  const excludeForTrade = new Set([...ownedSet, ...wishlistPinIds]);
  const forTradePinIds = shuffle(pins.filter((p) => !excludeForTrade.has(p.id)), 23)
    .slice(0, 20)
    .map((p) => p.id);

  const rows = [
    ...ownedPinIds.map((id) => ({
      user_id: USER_ID,
      pin_id: id,
      status: "owned",
      quantity: dupPicks.has(id) ? 2 : 1,
      is_favourite: favouritePicks.has(id),
    })),
    ...wishlistPinIds.map((id) => ({ user_id: USER_ID, pin_id: id, status: "wanted", quantity: 1, is_favourite: false })),
    ...forTradePinIds.map((id) => ({ user_id: USER_ID, pin_id: id, status: "for_trade", quantity: 1, is_favourite: false })),
  ];

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    showcaseSets: setPlan,
    counts: {
      owned: ownedPinIds.length,
      ownedFromShowcaseSets: ownedFromSets.size,
      duplicates: dupPicks.size,
      favourites: favouritePicks.size,
      wishlist: wishlistPinIds.length,
      forTrade: forTradePinIds.length,
      totalRows: rows.length,
    },
  }, null, 2));

  if (!APPLY) {
    console.log("\nDry run only — no writes performed. Re-run with --apply to write.");
    return;
  }

  const { data: written, error } = await supabase.from("user_pins").upsert(rows, { onConflict: "user_id,pin_id" }).select("id, pin_id, status");
  if (error) throw new Error(`upsert user_pins: ${error.message}`);

  const manifestPath = `/Users/alperahmet/PinHunt-Development/artifacts/api-server/scripts/showcase-seed-manifest-${Date.now()}.json`;
  fs.writeFileSync(manifestPath, JSON.stringify({ userId: USER_ID, createdAt: new Date().toISOString(), rowIds: written.map((r) => r.id) }, null, 2));
  console.log(`\nWrote ${written.length} user_pins rows. Manifest: ${manifestPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

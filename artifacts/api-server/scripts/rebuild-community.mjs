/**
 * Community feed reset + repopulate — Catalogue V2 showcase data.
 *
 * Deletes all existing community_posts (no genuine data to preserve at this
 * stage, per explicit instruction), then rebuilds ~18 realistic posts from
 * clean demo/test accounts, engineering deliberate ISO<->For-Trade matches
 * (including several involving the seeded admin account) using only real
 * Catalogue V2 pins.
 *
 * Usage: node --env-file=.env scripts/rebuild-community.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ME = "fcbcf74e-4ff6-4dba-b11a-373ee8e4bfb9"; // alper1990, seeded showcase admin
// Demo/test accounts only — all @example.com, clearly non-genuine, all have clean usernames.
const DEMO = {
  pintester: "f92e2564-308e-4924-a09c-e04673a9988d",
  tester2e: "afe3a553-5f43-43cf-8af9-da5d3a9e2e20",
  testerbee: "9646cd72-12e4-4136-9182-c825ecae1355",
  qa1793: "50336544-3d98-463f-be68-3183157b23e1",
  tester1982: "ae47164f-e894-4ba4-b8b7-f235a659e46e",
  u610574: "a8a02d4e-8b5c-428d-b8e4-2e7ea1a17dc6",
};
const DEMO_IDS = Object.values(DEMO);

function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
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
  // ── 1. Delete all existing community posts ──
  const { count: oldCount } = await supabase.from("community_posts").select("id", { count: "exact", head: true });
  if (APPLY) {
    const { error } = await supabase.from("community_posts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(`delete posts: ${error.message}`);
  }

  // ── 2. Load my seeded showcase state ──
  const myRows = await fetchAll("user_pins", "pin_id, status, pins(id,pinhunt_id,title,edition_type,origin,catalogue_source)", (q) => q.eq("user_id", ME));
  const myWanted = myRows.filter((r) => r.status === "wanted" && r.pins.catalogue_source === "collectible_pintrader").map((r) => r.pins);
  const myForTrade = myRows.filter((r) => r.status === "for_trade" && r.pins.catalogue_source === "collectible_pintrader").map((r) => r.pins);
  const myOwnedIds = new Set(myRows.filter((r) => r.status === "owned").map((r) => r.pin_id));

  // ── 3. Sets with 3+ members (post-cleanup) for set-completion posts ──
  const activeSets = await fetchAll("pin_sets", "id, set_name", (q) => q.eq("catalogue_source", "collectible_pintrader").eq("is_legacy_v1", false));
  const memberships = await fetchAll("pin_set_memberships", "pin_id, set_id");
  const membersBySet = new Map();
  for (const m of memberships) { if (!membersBySet.has(m.set_id)) membersBySet.set(m.set_id, []); membersBySet.get(m.set_id).push(m.pin_id); }
  const setPinInfo = await fetchAll("pins", "id, title, image_url", (q) => q.eq("catalogue_source", "collectible_pintrader"));
  const pinById = new Map(setPinInfo.map((p) => [p.id, p]));

  const candidateSets = shuffle(
    activeSets.filter((s) => (membersBySet.get(s.id)?.length ?? 0) >= 4 && (membersBySet.get(s.id)?.length ?? 0) <= 20),
    5
  ).slice(0, 4);

  // ── 4. General pin pool for reciprocal pairs / variety posts (not overlapping my owned/wanted/fortrade) ──
  const excludeMine = new Set([...myOwnedIds, ...myWanted.map((p) => p.id), ...myForTrade.map((p) => p.id)]);
  const generalPool = shuffle(setPinInfo.filter((p) => !excludeMine.has(p.id)), 9);

  // ── 5. Engineer matches ──
  const demoList = shuffle(DEMO_IDS, 3);
  const engineeredRows = []; // { user_id, pin_id, status }
  const matchLog = { giveMeYours: [], wantMine: [], strongMatch: null, reciprocalPairs: [] };

  // (a) Demo accounts have pins I want, marked for_trade -> "someone has what I want"
  const giveMeYoursPicks = shuffle(myWanted, 11).slice(0, 9);
  giveMeYoursPicks.forEach((pin, i) => {
    const owner = demoList[i % demoList.length];
    engineeredRows.push({ user_id: owner, pin_id: pin.id, status: "for_trade" });
    matchLog.giveMeYours.push({ demo: owner, pin: pin.title, pinhuntId: pin.pinhunt_id });
  });

  // (b) Demo accounts want pins I have for trade -> "someone wants what I have"
  const wantMinePicks = shuffle(myForTrade, 17).slice(0, 6);
  wantMinePicks.forEach((pin, i) => {
    const wanter = demoList[(i + 2) % demoList.length];
    engineeredRows.push({ user_id: wanter, pin_id: pin.id, status: "wanted" });
    matchLog.wantMine.push({ demo: wanter, pin: pin.title, pinhuntId: pin.pinhunt_id });
  });

  // (c) Strong match: one demo account gets BOTH relationships with me
  const strongAccount = demoList[0];
  const strongGive = giveMeYoursPicks[0];
  const strongWant = wantMinePicks[0];
  if (strongGive && strongWant) {
    engineeredRows.push({ user_id: strongAccount, pin_id: strongGive.id, status: "for_trade" });
    engineeredRows.push({ user_id: strongAccount, pin_id: strongWant.id, status: "wanted" });
    matchLog.strongMatch = { demo: strongAccount, theyHaveIWant: strongGive.title, theyWantIHave: strongWant.title };
  }

  // (d) Reciprocal pairs between two OTHER collectors (not involving me)
  const pairPool = shuffle(generalPool, 21);
  const pairs = [[demoList[0], demoList[1]], [demoList[2], demoList[3]], [demoList[4], demoList[5]]];
  let poolIdx = 0;
  for (const [a, b] of pairs) {
    const pinA = pairPool[poolIdx++]; // A has, B wants
    const pinB = pairPool[poolIdx++]; // B has, A wants
    if (!pinA || !pinB) continue;
    engineeredRows.push({ user_id: a, pin_id: pinA.id, status: "for_trade" });
    engineeredRows.push({ user_id: b, pin_id: pinA.id, status: "wanted" });
    engineeredRows.push({ user_id: b, pin_id: pinB.id, status: "for_trade" });
    engineeredRows.push({ user_id: a, pin_id: pinB.id, status: "wanted" });
    matchLog.reciprocalPairs.push({ a, b, aHas: pinA.title, bHas: pinB.title });
  }

  // (e) Set-completion scenario: for each candidate set, one demo account owns most, misses 1-2
  const setCompletionPlans = [];
  for (const [i, s] of candidateSets.entries()) {
    const owner = demoList[(i + 3) % demoList.length];
    const members = shuffle(membersBySet.get(s.id) ?? [], s.id.charCodeAt(0));
    const missCount = Math.min(2, Math.max(1, Math.floor(members.length * 0.2)));
    const missing = members.slice(0, missCount);
    const owned = members.slice(missCount);
    for (const pinId of owned) engineeredRows.push({ user_id: owner, pin_id: pinId, status: "owned" });
    for (const pinId of missing) engineeredRows.push({ user_id: owner, pin_id: pinId, status: "wanted" });
    setCompletionPlans.push({ owner, setId: s.id, setName: s.set_name, ownedCount: owned.length, totalMembers: members.length, missingPinIds: missing });
  }

  // Dedupe engineeredRows on (user_id, pin_id) -- last write wins, matches upsert semantics
  const dedup = new Map();
  for (const r of engineeredRows) dedup.set(`${r.user_id}|${r.pin_id}`, r);
  const finalUserPinRows = [...dedup.values()];

  if (APPLY) {
    function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
    for (const batch of chunk(finalUserPinRows, 200)) {
      const { error } = await supabase.from("user_pins").upsert(batch, { onConflict: "user_id,pin_id" });
      if (error) throw new Error(`upsert engineered user_pins: ${error.message}`);
    }
  }

  // ── 6. Build community posts ──
  const posts = [];
  const push = (author, post_type, body, linked_pin_id, extra = {}) => posts.push({ author_id: author, post_type, body, linked_pin_id, photos: [], ...extra });

  // For-trade posts (mix of engineered matches + general variety)
  push(strongAccount, "for_trade", `Got a couple of duplicates going spare — including this one. Mainly after Mickey or older mystery pins if anyone's swapping!`, strongGive?.id);
  matchLog.giveMeYours.slice(1, 4).forEach((m, i) => {
    const demoName = Object.keys(DEMO).find((k) => DEMO[k] === m.demo);
    push(m.demo, "for_trade", [
      `${m.pin} up for trade if anyone's after it — happy to look at offers!`,
      `Few traders added today, this one included. UK postage no problem.`,
      `Spare copy of this one sitting in my box, would rather it go to a good home 🙂`,
    ][i % 3], setPinInfo.find((p) => p.title === m.pin)?.id);
  });
  matchLog.reciprocalPairs.forEach((p, i) => {
    const pinObj = generalPool.find((x) => x.title === p.aHas);
    push(p.a, "for_trade", [`${p.aHas} available — looking mainly for DLP or parks pins in return.`][0], pinObj?.id);
  });

  // ISO posts
  matchLog.wantMine.slice(0, 4).forEach((m) => {
    push(m.demo, "in_search_of", [
      `ISO this one to finish the set 🤞 traders on my profile if that helps!`,
      `Been after this one for ages, anyone got it spare?`,
      `Down to needing just this one — happy to trade or top up with cash.`,
    ][Math.floor(Math.random() * 3)], setPinInfo.find((p) => p.title === m.pin)?.id);
  });
  if (strongWant) push(strongAccount, "in_search_of", `Still hunting for this one — got some decent traders if anyone wants to swap!`, strongWant.id);
  matchLog.reciprocalPairs.forEach((p) => {
    const pinObj = generalPool.find((x) => x.title === p.bHas);
    push(p.b, "in_search_of", `Anyone trading this one? Would make my week 😅`, pinObj?.id);
  });

  // Set-completion posts
  for (const plan of setCompletionPlans) {
    const missingTitles = plan.missingPinIds.map((id) => pinById.get(id)?.title).filter(Boolean);
    push(
      plan.owner,
      "in_search_of",
      `Down to my last ${plan.missingPinIds.length} from the "${plan.setName}" set — just need ${missingTitles.join(" and ")} to complete it. Traders on my profile!`,
      plan.missingPinIds[0]
    );
  }

  // General discussion / variety filler to reach ~18-20
  const chatPool = shuffle(generalPool, 33).slice(0, 3);
  const chatBodies = [
    "Anyone else find DLP pins way harder to track down from the UK? Always seems to be the last one I need.",
    "Finally got round to sorting my duplicates box tonight — turns out I had way more spares than I thought!",
    "Is anyone going to the next Disney Store trading night? First time considering it, curious what it's like.",
  ];
  chatPool.forEach((p, i) => push(demoList[(i + 1) % demoList.length], "discussion", chatBodies[i], p.id));

  const finalPosts = posts.filter((p) => p.linked_pin_id).slice(0, 20);

  if (APPLY) {
    const { error } = await supabase.from("community_posts").insert(finalPosts);
    if (error) throw new Error(`insert posts: ${error.message}`);
  }

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    oldPostsDeleted: APPLY ? oldCount : `(would delete ${oldCount})`,
    newPostsCreated: finalPosts.length,
    postsByAuthor: Object.fromEntries(Object.entries(DEMO).map(([k, v]) => [k, finalPosts.filter((p) => p.author_id === v).length])),
    engineeredUserPinRows: finalUserPinRows.length,
    matchLog,
    setCompletionPlans: setCompletionPlans.map((s) => ({ owner: s.owner, setName: s.setName, owned: s.ownedCount, total: s.totalMembers })),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

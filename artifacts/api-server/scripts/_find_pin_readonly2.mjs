import { createClient } from "@supabase/supabase-js";

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

const pins = await fetchAll(
  "pins",
  "id, pinhunt_id, title, catalogue_source, verification_status, image_url",
  (q) => q.eq("catalogue_source", "collectible_pintrader").eq("verification_status", "verified")
);
console.log("V2 verified pin count:", pins.length);
const pinById = new Map(pins.map(p => [p.id, p]));

const allEstimates = await fetchAll(
  "pin_market_estimates",
  "pin_id, marketplace, currency, estimated_mid, comparable_count, confidence, calculated_at"
);
const v2Ids = new Set(pins.map(p => p.id));
const estimates = allEstimates.filter(e => v2Ids.has(e.pin_id));
console.log("estimates found for V2 pins:", estimates.length, "/ total estimates:", allEstimates.length);

const byPin = new Map();
for (const e of estimates) {
  if (!byPin.has(e.pin_id)) byPin.set(e.pin_id, {});
  byPin.get(e.pin_id)[e.marketplace] = e;
}

const candidates = [];
for (const [pinId, ests] of byPin.entries()) {
  const gb = ests.EBAY_GB;
  const us = ests.EBAY_US;
  if (!gb && !us) continue;
  candidates.push({ pinId, gb, us, ...pinById.get(pinId) });
}
candidates.sort((a,b) => (b.gb?.estimated_mid ?? 0) - (a.gb?.estimated_mid ?? 0));
for (const c of candidates.slice(0, 30)) {
  console.log(JSON.stringify({
    pinhunt_id: c.pinhunt_id, title: c.title, image_url: !!c.image_url,
    gbMid: c.gb?.estimated_mid, gbCount: c.gb?.comparable_count, gbConf: c.gb?.confidence,
    usMid: c.us?.estimated_mid, usCount: c.us?.comparable_count, usConf: c.us?.confidence,
  }));
}

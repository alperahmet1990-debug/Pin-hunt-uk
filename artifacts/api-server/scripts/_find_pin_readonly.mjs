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

const estimates = await fetchAll(
  "pin_market_estimates",
  "pin_id, marketplace, currency, estimated_mid, comparable_count, confidence, calculated_at"
);

const byPin = new Map();
for (const e of estimates) {
  if (!byPin.has(e.pin_id)) byPin.set(e.pin_id, {});
  byPin.get(e.pin_id)[e.marketplace] = e;
}

const candidates = [];
for (const [pinId, ests] of byPin.entries()) {
  const gb = ests.EBAY_GB;
  const us = ests.EBAY_US;
  if (!gb || !us) continue;
  if (gb.estimated_mid == null || us.estimated_mid == null) continue;
  if (gb.confidence === "insufficient" || us.confidence === "insufficient") continue;
  const usInGbp = us.estimated_mid * 0.75; // rough FX
  const diffPct = ((gb.estimated_mid - usInGbp) / usInGbp) * 100;
  candidates.push({ pinId, gbMid: gb.estimated_mid, usMid: us.estimated_mid, gbCount: gb.comparable_count, usCount: us.comparable_count, diffPct });
}

candidates.sort((a, b) => Math.abs(a.diffPct - 34) - Math.abs(b.diffPct - 34));

const top = candidates.slice(0, 15);
const pinIds = top.map(c => c.pinId);
const pins = await fetchAll(
  "pins",
  "id, pinhunt_id, title, catalogue_source, verification_status",
  (q) => q.in("id", pinIds)
);
const pinById = new Map(pins.map(p => [p.id, p]));

for (const c of top) {
  const p = pinById.get(c.pinId);
  console.log(JSON.stringify({ ...c, ...p }));
}

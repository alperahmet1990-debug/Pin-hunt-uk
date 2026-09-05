import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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
  "id, pinhunt_id, title, retail_price, limited_edition_size, edition_type, image_url, collection",
  (q) => q.eq("catalogue_source", "collectible_pintrader").eq("verification_status", "verified").not("retail_price", "is", null).order("retail_price", { ascending: false }).limit(40)
);
for (const p of pins) console.log(JSON.stringify(p));

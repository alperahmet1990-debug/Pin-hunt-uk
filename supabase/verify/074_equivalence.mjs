// Local check for migration 074: the ASCII-escaped trade_clean_text gives the
// same output as 061's version on every input tried.
// Usage (outside the repo, in a scratch dir, like local-replay.mjs):
//   npm i @electric-sql/pglite@0.5.7 && node 074_equivalence.mjs <repo>
// PGlite is an in-process WASM Postgres; this never contacts a hosted database.
// The function is pure SQL, so both versions are loaded on their own (renamed)
// into a fresh database. 074_verify.sql runs on the full replay separately.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const REPO = process.argv[2];
const MIG = path.join(REPO, "supabase/migrations");

function extract(file, newName) {
  const sql = fs.readFileSync(path.join(MIG, file), "utf8");
  const m = sql.match(/create or replace function (?:public\.)?trade_clean_text\(p_text text\)[\s\S]*?\n\$\$;/);
  if (!m) throw new Error(`trade_clean_text not found in ${file}`);
  return m[0].replace(/function (?:public\.)?trade_clean_text\(/, `function ${newName}(`);
}

const db = new PGlite();
await db.exec(extract("061_trade_followups.sql", "clean_061"));
await db.exec(extract("074_trade_clean_text_ascii.sql", "clean_074"));

// Every BMP code point except surrogates, plus a few outside the BMP, each in
// several positions: alone, doubled, between letters, between spaces.
const { rows: [all] } = await db.query(`
  with cp as (
    select g from generate_series(1, 65535) g where g not between 55296 and 57343
    union all select unnest(array[65536, 128512, 917505, 1114111])
  ), inputs as (
    select s from cp, lateral (values
      (chr(g)), (chr(g) || chr(g)), ('a' || chr(g) || 'b'),
      ('a' || chr(g) || chr(g) || 'b'), (' ' || chr(g) || ' x ' || chr(g))
    ) v(s)
  )
  select count(*)::int as n,
         count(*) filter (where clean_061(s) is distinct from clean_074(s))::int as diff,
         count(*) filter (where s ~ '^a.b$' and clean_061(s) = 'ab')::int as removed,
         count(*) filter (where s ~ '^a.b$' and clean_061(s) = 'a b')::int as spaced
  from inputs`);
console.log(`code points: ${all.n} inputs, ${all.diff} differ; 061 removes ${all.removed} and spaces ${all.spaced} code points`);
// Sanity: the 22 format characters and 83 space-like characters listed in 074.
if (all.removed !== 22 || all.spaced !== 83) { console.log("unexpected counts: the functions did not load as expected"); process.exitCode = 1; }

// Named cases and random mixes of the listed characters with ordinary text.
const listed = [0xad, ...range(0x200b, 0x200f), ...range(0x202a, 0x202e), ...range(0x2060, 0x2069), 0xfeff,
  ...range(0x01, 0x20), ...range(0x7f, 0xa0), 0x1680, ...range(0x2000, 0x200a), 0x2028, 0x2029, 0x202f, 0x205f, 0x3000];
const pool = [...listed.map(c => String.fromCodePoint(c)), "a", "B", "7", "?", ":", "\u00E9", "\u2014", "\ud83d\udccc"];
const cases = [null, "", "Swap?\nPinHunt:\u200B  ok", "\t\tline one\r\nline two\u2028three\u2029", "\u00A0\u00A0nbsp\u00A0", "\uFEFFbom"];
let seed = 74;
const rnd = n => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
for (let i = 0; i < 20000; i++) {
  let s = "";
  for (let j = rnd(12); j >= 0; j--) s += pool[rnd(pool.length)];
  cases.push(s);
}
const { rows: [mix] } = await db.query(
  `select count(*)::int as n, count(*) filter (where clean_061(s) is distinct from clean_074(s))::int as diff
     from unnest($1::text[]) s`, [cases]);
console.log(`mixes: ${mix.n} inputs, ${mix.diff} differ`);

if (all.diff || mix.diff) {
  const { rows } = await db.query(
    `select s, clean_061(s) a, clean_074(s) b from unnest($1::text[]) s where clean_061(s) is distinct from clean_074(s) limit 5`, [cases]);
  console.log(JSON.stringify(rows));
  process.exitCode = 1;
} else {
  console.log("074 EQUIVALENT TO 061");
}

function range(a, b) { const r = []; for (let c = a; c <= b; c++) r.push(c); return r; }

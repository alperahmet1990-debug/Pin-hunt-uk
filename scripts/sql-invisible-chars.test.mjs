// Fails if SQL under supabase/migrations or supabase/verify has invisible or
// format Unicode characters typed in literally outside a comment line.
// Copying such a file from a browser into the Supabase SQL editor can drop or
// change them silently; that broke trade_clean_text on production (061, fixed
// by 074). Write them as escapes instead: '\uXXXX' inside a regular expression,
// E'\uXXXX' in a string, or chr(n).
// Run: node --test scripts/sql-invisible-chars.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["supabase/migrations", "supabase/verify"];

// Format characters (Cf: soft hyphen, zero-width, bidi controls, BOM...), line
// and paragraph separators, private use, lone surrogates, any space other than
// U+0020, and control characters other than tab, newline and carriage return.
const INVISIBLE = /[\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]|(?! )\p{Zs}|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/u;

// Lines written before this check. Existing migrations are never edited, so
// they stay listed; nothing new may be added here.
const KNOWN = {
  "supabase/migrations/061_trade_followups.sql": [28, 30],
  "supabase/verify/061_verify.sql": [95, 117, 118, 119],
};

export function findInvisible(text) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (/^\s*--/.test(line)) return;
    const chars = [...line].filter(c => INVISIBLE.test(c));
    if (chars.length) {
      hits.push({ line: i + 1, codePoints: chars.map(c => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")) });
    }
  });
  return hits;
}

test("detector flags invisible characters and ignores comments and escapes", () => {
  const zwsp = String.fromCodePoint(0x200b);
  const nbsp = String.fromCodePoint(0xa0);
  const ls = String.fromCodePoint(0x2028);
  assert.deepEqual(findInvisible(`select '[${zwsp}]';`), [{ line: 1, codePoints: ["U+200B"] }]);
  assert.deepEqual(findInvisible(`ok\nselect '${nbsp}${ls}';`), [{ line: 2, codePoints: ["U+00A0", "U+2028"] }]);
  assert.deepEqual(findInvisible(`  -- a comment may mention ${zwsp}`), []);
  assert.deepEqual(findInvisible("select E'\\" + "u200B', '\\" + "u00A0', chr(8203);\tcaf" + String.fromCodePoint(0xe9)), []);
});

test("migrations and verify scripts write invisible characters as escapes", () => {
  const problems = [];
  for (const dir of DIRS) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith(".sql")).sort()) {
      const rel = `${dir}/${f}`;
      const known = new Set(KNOWN[rel] ?? []);
      for (const hit of findInvisible(fs.readFileSync(path.join(ROOT, rel), "utf8"))) {
        if (!known.has(hit.line)) problems.push(`${rel}:${hit.line} ${hit.codePoints.join(" ")}`);
      }
    }
  }
  assert.deepEqual(problems, [], "Invisible characters typed into SQL (write them as \\uXXXX escapes):\n" + problems.join("\n"));
});

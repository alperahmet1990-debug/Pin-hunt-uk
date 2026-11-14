// Unit tests for build-move-and-clean-sql.mjs. The SQL itself was run against a
// local production-shaped replay (PGlite): see PRODUCTION-CATALOGUE-RESET.md.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applySql, previewSql, readLinks } from "./build-move-and-clean-sql.mjs";

test("links: later files override earlier; unlinked decisions drop out; junk ignored", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-"));
  const csv = path.join(dir, "confirmed-links.csv");
  fs.writeFileSync(csv, "ctp_pinhunt_id,ctp_title,pin_and_pop_pinhunt_id\nPHUK-00013001,A,PHUK-10000001\nPHUK-00013002,B,PHUK-10000002\nbad,x,PHUK-1\n");
  const dec = path.join(dir, "decisions-2.json");
  fs.writeFileSync(dec, JSON.stringify([{ ctp: "PHUK-00013002", pin: null }, { ctp: "PHUK-00013003", pin: "PHUK-10000003" }, { ctp: "x'); drop table pins;--", pin: "PHUK-10000004" }]));
  assert.deepEqual(readLinks([csv, dec]), [{ old: "PHUK-00013001", pin: "PHUK-10000001" }, { old: "PHUK-00013003", pin: "PHUK-10000003" }]);
});

test("generated SQL: production guards, IDs only, preview reads only", () => {
  const links = [{ old: "PHUK-00013001", pin: "PHUK-10000001" }];
  for (const sql of [previewSql(links), applySql(links)]) {
    assert.match(sql, /pinhunt-staging-marker/);
    assert.match(sql, /is distinct from 'production'/);
    assert.match(sql, /< 116000/);
    assert.match(sql, /\('PHUK-00013001','PHUK-10000001'\)/);
  }
  const preview = previewSql(links);
  assert.doesNotMatch(preview.replace(/create temp table[\s\S]*?;/g, ""), /\b(insert into public|update public|delete from public)\b/i, "preview never writes real tables");
  assert.match(applySql(links), /delete from public\.pins p using _old o/);
  assert.doesNotMatch(applySql(links), /storage\.objects/, "photo files are never deleted");
});

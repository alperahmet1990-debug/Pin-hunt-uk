/**
 * One-off fast bulk import: XLSX → CSV staging → psql \copy → set-based upserts.
 * Usage: node scripts/bulk-import.mjs <path-to-xlsx>
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('xlsx path required'); process.exit(1); }

const wb = XLSX.read(fs.readFileSync(src), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
console.log(`rows: ${rows.length}`);

const s = v => (v === null || v === undefined || v === '') ? null : String(v).trim() || null;
const n = v => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return isNaN(x) ? null : x; };
const semi = v => typeof v === 'string' ? v.split(';').map(x => x.trim()).filter(Boolean) : [];
const mapVs = v => {
  const x = typeof v === 'string' ? v.toLowerCase().trim() : '';
  if (x === 'verified') return 'verified';
  if (x === 'community submitted') return 'community_submitted';
  return 'needs_source_verification';
};
const dateStr = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') { // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(String(v).trim());
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const csvEsc = v => v === null ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

const out = { pins: [], chars: [], cats: [], ext: [], srcs: [] };
let skipped = 0;
for (const r of rows) {
  const pid = s(r['pinhunt_id']);
  if (!pid) { skipped++; continue; }
  out.pins.push([
    pid, s(r['Pin name']) ?? pid, s(r['Brand']) ?? 'Unknown', s(r['Series']) ?? 'Uncategorised',
    n(r['Release year']), dateStr(r['Release date']), n(r['Original price']), s(r['Currency']) ?? 'USD',
    n(r['Edition size']), s(r['Park / Retailer']), s(r['Edition type']),
    s(r['Front image URL']), s(r['Back image URL']), mapVs(r['Verification status']),
  ]);
  for (const c of semi(r['Characters'])) out.chars.push([pid, c]);
  for (const c of semi(r['Categories'])) out.cats.push([pid, c]);
  for (const e of semi(r['external_ids'])) {
    const i = e.indexOf(':');
    if (i === -1) continue;
    const source = e.slice(0, i).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const eid = e.slice(i + 1).trim();
    if (source && eid) out.ext.push([pid, source, eid]);
  }
  const u = s(r['Source URL']);
  if (u) out.srcs.push([pid, u]);
}

const dir = '/tmp/pin-import';
fs.mkdirSync(dir, { recursive: true });
const write = (name, arr) => {
  fs.writeFileSync(path.join(dir, name), arr.map(row => row.map(csvEsc).join(',')).join('\n'));
  console.log(`${name}: ${arr.length}`);
};
write('pins.csv', out.pins);
write('chars.csv', out.chars);
write('cats.csv', out.cats);
write('ext.csv', out.ext);
write('srcs.csv', out.srcs);
if (skipped) console.log(`skipped (no pinhunt_id): ${skipped}`);

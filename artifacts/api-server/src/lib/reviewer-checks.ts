/**
 * Reviewer checks from the backfill workbook (PinHunt_catalogue_2015_2026.xlsx, sheet "Research pins",
 * columns research_key / My check / optional Note).
 *
 * The .xlsx is read with node:zlib and a few regular expressions instead of the `xlsx` package, which
 * has unpatched advisories for crafted files. Only the three columns above are read; sizes are capped
 * so a hostile archive cannot exhaust memory.
 */
import { inflateRawSync } from "node:zlib";

export const CHECK_VALUES = ["ok", "wrong", "duplicate", "not a pin", "research needed"] as const;
export type CheckValue = (typeof CHECK_VALUES)[number];
export interface ReviewerCheck { research_key: string; check: CheckValue; note: string | null }

const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
export const MAX_CHECKS = 5000;

function unzip(buf: Buffer, wanted: (name: string) => boolean): Map<string, string> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not an .xlsx file");
  const count = buf.readUInt16LE(eocd + 10);
  if (count > MAX_ENTRIES) throw new Error("too many entries in the file");
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("damaged .xlsx file");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (!wanted(name)) continue;
    if (usize > MAX_ENTRY_BYTES || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error("damaged .xlsx file");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, data.toString("utf8"));
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8"));
    else throw new Error("unsupported compression in .xlsx file");
  }
  return out;
}

const decode = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
  e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&"
    : String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join("");
const colOf = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Reads the "Research pins" sheet into rows of cell text (row 0 = headers). */
function sheetRows(buf: Buffer): string[][] {
  const files = unzip(buf, n => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const wb = files.get("xl/workbook.xml") ?? "";
  const sheet = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0]).find(s => decode(/name="([^"]*)"/.exec(s)?.[1] ?? "") === "Research pins");
  if (!sheet) throw new Error('The workbook has no "Research pins" sheet');
  const rid = /r:id="([^"]+)"/.exec(sheet)?.[1];
  const rel = [...(files.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => r.includes(`Id="${rid}"`));
  const target = /Target="([^"]+)"/.exec(rel ?? "")?.[1]?.replace(/^\/?(xl\/)?/, "");
  const xml = target ? files.get(`xl/${target}`) : undefined;
  if (!xml) throw new Error('Could not read the "Research pins" sheet');
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]));
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(c[1])?.[1];
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      row[colOf(ref)] = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? textOf(body) : decode(v ?? "");
    }
    rows.push(row);
  }
  return rows;
}

/** Turns a returned workbook into checks. Rows with an unrecognised value are reported, not guessed. */
export function checksFromWorkbook(buf: Buffer): { checks: ReviewerCheck[]; unrecognised: string[] } {
  const [hdr = [], ...rows] = sheetRows(buf);
  const h = hdr.map(x => String(x ?? "").trim().toLowerCase());
  const ki = h.indexOf("research_key"), ci = h.indexOf("my check"), ni = h.indexOf("note");
  if (ki < 0 || ci < 0) throw new Error('Add a "My check" column to the Research pins sheet');
  return normaliseChecks(rows.map(r => ({ research_key: r[ki], check: r[ci], note: ni >= 0 ? r[ni] : null })));
}

/** Validates checks from a workbook or a reviewer-checks JSON file (pinhunt-reviewer-checks-v1). */
export function normaliseChecks(raw: Array<{ research_key?: unknown; check?: unknown; note?: unknown }>) {
  const byKey = new Map<string, ReviewerCheck>();
  const unrecognised: string[] = [];
  for (const r of raw) {
    const key = String(r.research_key ?? "").trim();
    const check = String(r.check ?? "").trim().toLowerCase();
    if (!key || !check) continue;
    if (key.length > 200 || !(CHECK_VALUES as readonly string[]).includes(check)) { unrecognised.push(`${key.slice(0, 80)}: ${check.slice(0, 40)}`); continue; }
    const note = r.note == null ? "" : String(r.note).trim();
    byKey.set(key, { research_key: key, check: check as CheckValue, note: note ? note.slice(0, 200) : null });
  }
  return { checks: [...byKey.values()], unrecognised };
}

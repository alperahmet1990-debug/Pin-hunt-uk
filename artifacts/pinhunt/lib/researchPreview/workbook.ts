/**
 * Reads the "My check" column of a returned backfill workbook in the browser (static Research Review
 * preview). Mirrors artifacts/api-server/src/lib/reviewer-checks.ts, but unzips with the browser's
 * DecompressionStream instead of node:zlib. Only the "Research pins" sheet's research_key, My check and
 * Note columns are read, with size caps.
 */
const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

async function inflateRaw(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ENTRY_BYTES) { await reader.cancel(); throw new Error('The workbook is too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return new TextDecoder().decode(out);
}

async function unzip(buf: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not an .xlsx file');
  const count = v.getUint16(eocd + 10, true);
  if (count > MAX_ENTRIES) throw new Error('too many entries in the file');
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('damaged .xlsx file');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!wanted(name)) continue;
    if (usize > MAX_ENTRY_BYTES || local + 30 > buf.length || v.getUint32(local, true) !== 0x04034b50) throw new Error('damaged .xlsx file');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, dec.decode(data));
    else if (method === 8) out.set(name, await inflateRaw(data));
    else throw new Error('unsupported compression in .xlsx file');
  }
  return out;
}

const decode = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'" : e === 'amp' ? '&'
    : String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('');
const colOf = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Rows of the "Research pins" sheet as cell text (row 0 = headers). */
export async function researchPinsRows(buf: Uint8Array): Promise<string[][]> {
  const files = await unzip(buf, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const wb = files.get('xl/workbook.xml') ?? '';
  const sheet = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0]).find(s => decode(/name="([^"]*)"/.exec(s)?.[1] ?? '') === 'Research pins');
  if (!sheet) throw new Error('The workbook has no "Research pins" sheet');
  const rid = /r:id="([^"]+)"/.exec(sheet)?.[1];
  const rel = [...(files.get('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => r.includes(`Id="${rid}"`));
  const target = /Target="([^"]+)"/.exec(rel ?? '')?.[1]?.replace(/^\/?(xl\/)?/, '');
  const xml = target ? files.get(`xl/${target}`) : undefined;
  if (!xml) throw new Error('Could not read the "Research pins" sheet');
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]));
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(c[1])?.[1];
      const body = c[2] ?? '';
      const val = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      row[colOf(ref)] = type === 's' ? (shared[Number(val)] ?? '') : type === 'inlineStr' ? textOf(body) : decode(val ?? '');
    }
    rows.push(row);
  }
  return rows;
}

/** research_key / My check / Note rows from a returned workbook (base64), for the checks route. */
export async function checksFromWorkbookBase64(base64: string) {
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const [hdr = [], ...rows] = await researchPinsRows(buf);
  const h = hdr.map(x => String(x ?? '').trim().toLowerCase());
  const ki = h.indexOf('research_key'), ci = h.indexOf('my check'), ni = h.indexOf('note');
  if (ki < 0 || ci < 0) throw new Error('Add a "My check" column to the Research pins sheet');
  return rows.map(r => ({ research_key: r[ki], check: r[ci], note: ni >= 0 ? r[ni] : null }));
}

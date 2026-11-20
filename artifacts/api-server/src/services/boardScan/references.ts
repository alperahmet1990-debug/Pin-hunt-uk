/**
 * Board scanning — reference pictures for the comparison step.
 *
 * Reference pictures used to be passed to OpenAI as Pin & Pop web addresses
 * for it to download. One address it couldn't fetch failed the whole request;
 * the failure was only logged, so every candidate silently showed as "not
 * checked". Here the API server downloads each picture itself (with a
 * timeout and a size limit), shrinks it, and sends it inline; a picture that
 * can't be fetched is simply left out.
 *
 * Pin & Pop pictures are used only inside the comparison: held in memory for
 * the request, never stored or returned to the app (scripts/PINANDPOP.md).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";

const TIMEOUT_MS = 6_000;
const MAX_BYTES = 8 * 1024 * 1024;
/** Long side sent to the model: enough for frame metal, dangles and small text. */
const SEND_SIDE = 768;

/** The IPv4 address inside an IPv4-mapped/-compatible IPv6 address, in either written form, or null. */
function embeddedIPv4(v6: string): string | null {
  const m = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (m) return m[1];
  const h = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
  if (!h) return null;
  const hi = parseInt(h[1], 16);
  const lo = parseInt(h[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Loopback, private, link-local and other non-public addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    const [, , c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 ||
      // IETF protocol assignments, benchmarking and documentation ranges.
      (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  const v6 = ip.toLowerCase();
  const inner = embeddedIPv4(v6);
  if (inner) return isPrivateAddress(inner);
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || /^fe[89a-f]/.test(v6) ||
    v6.startsWith("ff") ||
    // NAT64 and 6to4 can reach IPv4 addresses, including private ones.
    v6.startsWith("64:ff9b:") || v6.startsWith("2002:");
}

/** Refuse a URL that isn't http(s) or whose host is (or resolves to) a non-public address. */
async function assertPublicUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("not a web address");
  if (allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("address lookup timed out")), 3_000).unref()),
    ])).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("address not allowed");
  return url;
}

const MAX_REDIRECTS = 3;

/**
 * Download a picture (timeout, size limit). Throws with a short reason.
 * Redirects are followed by hand (at most 3), and every hop must be a public
 * http(s) address, so a catalogue URL can't send the server to an internal
 * one. The body is read in chunks and abandoned once it passes the limit, so
 * a missing or wrong Content-Length can't make it buffer a huge file.
 */
export async function downloadPicture(
  url: string,
  maxBytes = MAX_BYTES,
  opts: { allowPrivate?: boolean } = {},
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = url;
    let res: Response;
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(current, opts.allowPrivate === true);
      res = await fetch(current, { signal: controller.signal, redirect: "manual" });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
        const nextUrl = new URL(res.headers.get("location")!, current);
        // Never downgrade from https to http.
        if (new URL(current).protocol === "https:" && nextUrl.protocol !== "https:") throw new Error("insecure redirect");
        current = nextUrl.toString();
        continue;
      }
      break;
    }
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > maxBytes) throw new Error("picture too large");
    if (!res.body) throw new Error("empty picture");
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > maxBytes) {
        controller.abort();
        throw new Error("picture too large");
      }
      chunks.push(Buffer.from(chunk));
    }
    if (total === 0) throw new Error("empty picture");
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

/** A reference picture as an inline JPEG data URL, or null if it can't be fetched or read. */
export async function fetchReferenceImage(url: string, opts: { allowPrivate?: boolean } = {}): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const body = await downloadPicture(url, MAX_BYTES, opts);
    const jpeg = await sharp(body).rotate().removeAlpha()
      .resize(SEND_SIDE, SEND_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

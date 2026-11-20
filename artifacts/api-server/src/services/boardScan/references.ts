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

/** Loopback, private, link-local and other non-public addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Refuse a URL that isn't http(s) or whose host is (or resolves to) a non-public address. */
async function assertPublicUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("not a web address");
  if (allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
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
        if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
        current = new URL(res.headers.get("location")!, current).toString();
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

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
import sharp from "sharp";

const TIMEOUT_MS = 6_000;
const MAX_BYTES = 8 * 1024 * 1024;
/** Long side sent to the model: enough for frame metal, dangles and small text. */
const SEND_SIDE = 768;

/**
 * Download a picture (timeout, size limit). Throws with a short reason.
 * The body is read in chunks and abandoned once it passes the limit, so a
 * missing or wrong Content-Length can't make it buffer a huge file.
 */
export async function downloadPicture(url: string, maxBytes = MAX_BYTES): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    if (!/^https?:$/.test(new URL(res.url || url).protocol)) throw new Error("not a web address");
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
export async function fetchReferenceImage(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const body = await downloadPicture(url);
    const jpeg = await sharp(body).rotate().removeAlpha()
      .resize(SEND_SIDE, SEND_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

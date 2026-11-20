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

/** A reference picture as an inline JPEG data URL, or null if it can't be fetched or read. */
export async function fetchReferenceImage(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > MAX_BYTES) return null;
    const jpeg = await sharp(body).rotate().removeAlpha()
      .resize(SEND_SIDE, SEND_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

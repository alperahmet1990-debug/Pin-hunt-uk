/**
 * Pixian.ai background-removal integration — normalizes a contributed pin
 * photo into a uniform catalogue thumbnail: solid white background, tight
 * crop to the pin, consistent margin, fixed square size. One API call does
 * all of it (no local image library needed).
 *
 * https://pixian.ai/api
 */

const PIXIAN_ENDPOINT = "https://api.pixian.ai/api/v2/remove-background";

export function pixianConfigured(): boolean {
  return !!(process.env.PIXIAN_API_ID && process.env.PIXIAN_API_SECRET);
}

/**
 * Send a photo to Pixian and return the normalized result: solid white
 * background, cropped to the pin with a consistent margin, fixed
 * 1200x1200 output, JPEG. Throws on a non-2xx response or missing config.
 */
export async function normalizePinPhoto(imageBuffer: Buffer, mimeType: string): Promise<Buffer> {
  const apiId = process.env.PIXIAN_API_ID;
  const apiSecret = process.env.PIXIAN_API_SECRET;
  if (!apiId || !apiSecret) {
    throw new Error("Pixian is not configured (PIXIAN_API_ID / PIXIAN_API_SECRET missing).");
  }

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), "photo.jpg");
  form.append("background.color", "FFFFFF");
  form.append("result.crop_to_foreground", "true");
  form.append("result.margin", "12%");
  form.append("result.target_size", "1200 1200");
  form.append("result.vertical_alignment", "middle");
  form.append("output.format", "jpeg");
  // Dev/test traffic only — Pixian watermarks the result and doesn't charge
  // credits. Gated on an explicit flag, never inferred, so a production
  // image can never silently come back watermarked.
  if (process.env.PIXIAN_TEST_MODE === "true") {
    form.append("test", "true");
  }

  const auth = Buffer.from(`${apiId}:${apiSecret}`).toString("base64");
  const res = await fetch(PIXIAN_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pixian request failed (${res.status}): ${body || res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Pin & Pop reference images for the scan's photo comparison (stage 3).
 *
 * Pin & Pop pins have no public catalogue photo (pins.image_url is null):
 * their images are reference-only pin_images rows (migration 042), which RLS
 * hides from everyone but admins. The scan may compare a collector's photo
 * against them (maintainer decision, 12 Nov 2026), so they're read here with
 * the service-role key.
 *
 * Rules:
 *   - the URLs are used only inside the OpenAI comparison prompt. They are
 *     never put on a CataloguePin, never returned to the app, and never logged;
 *   - only a pin with no public photo gets one;
 *   - best effort: no service key, an error or a slow lookup means no reference
 *     images, and the scan carries on with its text ranking.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PINANDPOP_SOURCE = "pin_and_pop";
/** The lookup has to be quick: it eats into the time left for the comparison. */
export const REFERENCE_LOOKUP_MS = 1_500;

let client: SupabaseClient | null | undefined;

function serviceClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

/** pinhunt_id → Pin & Pop reference image URL, for the given pins that have one. */
export async function pinAndPopReferenceImages(
  pinhuntIds: string[],
  supabase: SupabaseClient | null = serviceClient(),
  timeoutMs = REFERENCE_LOOKUP_MS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(pinhuntIds)].filter(Boolean);
  if (!supabase || ids.length === 0) return out;
  try {
    // Two indexed look-ups (pins by pinhunt_id, then pin_images by pin_id):
    // one embedded join scans every Pin & Pop image and takes over a second.
    const signal = AbortSignal.timeout(timeoutMs);
    const pins = await supabase.from("pins").select("id, pinhunt_id").in("pinhunt_id", ids).abortSignal(signal);
    if (pins.error || !pins.data?.length) return out;
    const pinhuntIdByUuid = new Map((pins.data as { id: string; pinhunt_id: string }[]).map((p) => [p.id, p.pinhunt_id]));
    const images = await supabase
      .from("pin_images")
      .select("pin_id, image_url")
      .eq("source", PINANDPOP_SOURCE)
      .eq("image_type", "reference")
      .in("pin_id", [...pinhuntIdByUuid.keys()])
      .abortSignal(signal);
    if (images.error || !images.data) return out;
    for (const row of images.data as { pin_id: string; image_url: string | null }[]) {
      const pinhuntId = pinhuntIdByUuid.get(row.pin_id);
      if (pinhuntId && row.image_url?.startsWith("https://") && !out.has(pinhuntId)) out.set(pinhuntId, row.image_url);
    }
  } catch {
    // best effort — see the header
  }
  return out;
}

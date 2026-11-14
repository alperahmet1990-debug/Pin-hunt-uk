/**
 * Bulk Image Matcher — publish an approved, cleaned photo as a pin's
 * catalogue image.
 *
 * Follows the existing contributed-photo publishing rules
 * (services/contributed-images.ts): the public copy goes into the public
 * pin-catalogue bucket with the PinHunt watermark burned in (the private
 * cleaned original stays clean), pins.image_url is set through the
 * PinRepository, and a pin_images row records it as approved.
 *
 * Extra rules for bulk uploads:
 *   - the batch must record public display permission;
 *   - a pin that already has a catalogue photo is only replaced when the
 *     admin explicitly says so (replaceExisting), and the replaced URL is
 *     kept on the item;
 *   - the pin_images row carries the provenance: source =
 *     'pinhunt_bulk_upload', source_record_id = the bulk item id (→ batch →
 *     supplier, permission basis, licence), content_hash of the cleaned photo.
 *
 * Re-running after a partial failure is safe: storage uses upsert, and an
 * existing pin_images row for this item is reused.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PinRepository } from "@workspace/pin-repository";
import { watermarkPinPhoto } from "../watermark";
import { BUCKET, download } from "./pipeline";

export const BULK_SOURCE = "pinhunt_bulk_upload";

export class PublishBlockedError extends Error {
  constructor(message: string, readonly code: "no_permission" | "has_image" | "not_ready", readonly existingImageUrl?: string) {
    super(message);
    this.name = "PublishBlockedError";
  }
}

export interface PublishableItem {
  id: string;
  batch_id: string;
  status: string;
  matched_pinhunt_id: string | null;
  cleaned_path: string | null;
  cleaned_sha256: string | null;
}

export interface PublishDeps {
  db: SupabaseClient;
  pinRepo: PinRepository;
}

export async function publishItem(
  item: PublishableItem,
  batch: { permission_public_display: boolean; permission_recorded_at: string },
  adminId: string,
  opts: { replaceExisting?: boolean },
  deps: PublishDeps,
): Promise<{ publicUrl: string; pinImageId: string; replacedImageUrl: string | null }> {
  if (!batch.permission_public_display) {
    throw new PublishBlockedError(
      "This batch has no recorded permission for public display, so its photos can't be published.",
      "no_permission",
    );
  }
  if (!["cleaned", "failed"].includes(item.status) || !item.cleaned_path || !item.matched_pinhunt_id) {
    throw new PublishBlockedError("This photo isn't cleaned and matched yet.", "not_ready");
  }

  const { data: pin, error: pinErr } = await deps.db.from("pins")
    .select("id, image_url").eq("pinhunt_id", item.matched_pinhunt_id).maybeSingle();
  if (pinErr) throw new Error(pinErr.message);
  if (!pin) throw new PublishBlockedError(`Pin ${item.matched_pinhunt_id} no longer exists.`, "not_ready");
  const pinRow = pin as { id: string; image_url: string | null };

  // Is the current image one this item already published (a retry)?
  const ownPrefix = `/pin-catalogue/${pinRow.id}/bulk-${item.id}.jpg`;
  const currentIsOurs = !!pinRow.image_url && pinRow.image_url.includes(ownPrefix);
  if (pinRow.image_url && !currentIsOurs && !opts.replaceExisting) {
    throw new PublishBlockedError(
      "This pin already has a catalogue photo. Confirm the replacement to publish.",
      "has_image",
      pinRow.image_url,
    );
  }

  const storage = deps.db.storage;
  const cleaned = await download(deps.db, item.cleaned_path);
  const watermarked = await watermarkPinPhoto(cleaned);
  const publicPath = `${pinRow.id}/bulk-${item.id}.jpg`;
  const { error: upErr } = await storage.from("pin-catalogue")
    .upload(publicPath, watermarked, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw new Error(`Could not publish image: ${upErr.message}`);
  const publicUrl = storage.from("pin-catalogue").getPublicUrl(publicPath).data.publicUrl;

  // Provenance row (reused on a retry).
  const { data: existingRow } = await deps.db.from("pin_images")
    .select("id").eq("source", BULK_SOURCE).eq("source_record_id", item.id).maybeSingle();
  let pinImageId = (existingRow as { id: string } | null)?.id;
  if (!pinImageId) {
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insErr } = await deps.db.from("pin_images").insert({
      pin_id: pinRow.id,
      image_url: publicUrl,
      image_type: "front",
      uploaded_by: adminId,
      status: "approved",
      source: BULK_SOURCE,
      source_record_id: item.id,
      content_hash: item.cleaned_sha256,
      public_display_allowed: true,
      attribution_required: false,
      contributor_consent_at: batch.permission_recorded_at,
      reviewed_by: adminId,
      reviewed_at: nowIso,
      description: `Bulk image matcher, batch ${item.batch_id}`,
    }).select("id").single();
    if (insErr) throw new Error(`Could not record image provenance: ${insErr.message}`);
    pinImageId = (inserted as { id: string }).id;
  }

  await deps.pinRepo.updatePin(item.matched_pinhunt_id, { imageUrl: publicUrl, needsFrontImage: false });

  return {
    publicUrl,
    pinImageId,
    replacedImageUrl: pinRow.image_url && !currentIsOurs ? pinRow.image_url : null,
  };
}

export { BUCKET };

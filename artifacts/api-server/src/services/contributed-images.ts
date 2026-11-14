/**
 * Publishing a contributed pin photo into the live catalogue — used by admin
 * approval (routes/pin-images.ts) and by an admin's explicit "publish now"
 * on their own contribution (routes/contribute-pin-image.ts). Every other
 * contribution, admins' included by default, waits in the review queue.
 *
 * Copies the Pixian-cleaned object from the private pin-contributed-images
 * bucket into the public pin-catalogue bucket with the PinHunt watermark
 * burned in (services/watermark.ts), writes pins.image_url, and marks the
 * pin_images row approved. The raw original (pin-contributed-raw, migration
 * 080) is never published: once the row is approved it is deleted
 * (discardRawOriginal), as it is on rejection (routes/pin-images.ts).
 *
 * Replace rule (same as services/bulkImages/publish.ts): a pin whose current
 * photo came from somewhere else is only replaced when the caller says so
 * (replaceExisting), or when the current photo is still exactly the one the
 * caller saw (replaceIfCurrentIs). The admin route uses the latter for
 * replacement proposals: the reviewer saw the photo being replaced on the
 * card, but if the pin's photo has changed since the queue loaded, the
 * publish stops with PublishBlockedError('has_image') so the admin sees the
 * new photo before confirming. A "missing photo" contribution for a pin that
 * has since gained a photo stops the same way until the admin confirms.
 *
 * Safe to re-run after a partial failure: the public object path is fixed
 * per contribution (upsert), a pin already showing this contribution's photo
 * is not treated as "has another photo", and an already-approved row is not
 * reviewed again. No cross-step transaction otherwise: a failure between the
 * storage copy and the DB writes can leave an orphaned public object.
 *
 * Needs a service-role client: cross-bucket storage moves can't be done in
 * SQL, and RLS blocks these writes otherwise.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContributedPinImage,
  PinRepository,
  IUserPinRepository,
} from "@workspace/pin-repository";
import { PublishBlockedError } from "./bulkImages/publish";
import { watermarkPinPhoto } from "./watermark";

export { PublishBlockedError };

/** Public pin-catalogue path for a contribution. Fixed, so a retry overwrites. */
export function contributedPublicPath(image: Pick<ContributedPinImage, "id" | "pinId">): string {
  return `${image.pinId}/contributed-${image.id}.jpg`;
}

/** Where raw originals live (migration 080). Admin-read only. */
export const RAW_BUCKET = "pin-contributed-raw";

/**
 * True when a raw path is inside the uploader's own folder ({uploadedBy}/…)
 * with no empty, "." or ".." segments. The API only ever writes such paths,
 * but a collector can insert their own pending pin_images row directly (038's
 * insert policy), so a stored path is never trusted to point at their file.
 */
export function isOwnRawPath(path: string | undefined, uploadedBy: string | undefined): path is string {
  if (!path || !uploadedBy) return false;
  const segments = path.split("/");
  return segments[0] === uploadedBy && segments.length > 1 && !segments.some((s) => s === "" || s === "." || s === "..");
}

/**
 * Delete a reviewed contribution's raw original and clear its path. The raw
 * photo exists only for the side-by-side review, so it goes once the row is
 * approved or rejected. Best-effort: a failure is logged (ids only) and never
 * fails the review that called it. Rows without a raw original are a no-op.
 */
export async function discardRawOriginal(
  image: Pick<ContributedPinImage, "id" | "rawStoragePath" | "uploadedBy">,
  serviceClient: SupabaseClient,
): Promise<boolean> {
  if (!image.rawStoragePath) return false;
  if (!isOwnRawPath(image.rawStoragePath, image.uploadedBy)) {
    console.error(`[contributed-images] raw path outside the uploader's folder, not deleted (image ${image.id})`);
    return false;
  }
  try {
    const { error: removeError } = await serviceClient.storage.from(RAW_BUCKET).remove([image.rawStoragePath]);
    if (removeError) throw new Error(removeError.message);
    const { error: updateError } = await serviceClient
      .from("pin_images").update({ raw_storage_path: null }).eq("id", image.id);
    if (updateError) throw new Error(updateError.message);
    return true;
  } catch (err) {
    console.error(`[contributed-images] raw original not deleted (image ${image.id}):`,
      err instanceof Error ? err.message : err);
    return false;
  }
}

export interface PublishContributedOptions {
  /** Replace a catalogue photo that came from somewhere else, whatever it is. */
  replaceExisting?: boolean;
  /**
   * Replace the current catalogue photo only if it is still this URL (the
   * one the reviewer saw). Any other current photo stops with 'has_image'.
   */
  replaceIfCurrentIs?: string;
}

export async function publishContributedImage(
  image: ContributedPinImage,
  reviewerId: string,
  deps: { serviceClient: SupabaseClient; userRepo: IUserPinRepository; pinRepo: PinRepository },
  opts: PublishContributedOptions = {},
): Promise<ContributedPinImage & { publicUrl: string; replacedImageUrl: string | null }> {
  if (!image.pinhuntId) {
    throw new Error("Contributed image is missing its linked pin.");
  }

  const publicPath = contributedPublicPath(image);
  const current = await deps.pinRepo.getPinByPinhuntId(image.pinhuntId);
  if (!current) {
    throw new PublishBlockedError(`Pin ${image.pinhuntId} no longer exists.`, "not_ready");
  }
  const currentUrl = current.imageUrl || null;
  const currentIsOurs = !!currentUrl && currentUrl.includes(`/pin-catalogue/${publicPath}`);
  const replaceAllowed = opts.replaceExisting === true
    || (opts.replaceIfCurrentIs !== undefined && opts.replaceIfCurrentIs === currentUrl);
  if (currentUrl && !currentIsOurs && !replaceAllowed) {
    throw new PublishBlockedError(
      "This pin already has a catalogue photo. Confirm the replacement to publish.",
      "has_image",
      currentUrl,
    );
  }

  const storage = deps.serviceClient.storage;
  const { data: blob, error: downloadError } = await storage
    .from("pin-contributed-images")
    .download(image.storagePath);
  if (downloadError || !blob) {
    throw new Error(`Could not read contributed image: ${downloadError?.message ?? "unknown"}`);
  }

  // Only the public copy is watermarked — the private original stays clean.
  const watermarked = await watermarkPinPhoto(Buffer.from(await blob.arrayBuffer()));

  const { error: uploadError } = await storage
    .from("pin-catalogue")
    .upload(publicPath, watermarked, { contentType: "image/jpeg", upsert: true });
  if (uploadError) {
    throw new Error(`Could not publish image: ${uploadError.message}`);
  }

  const { data: publicUrlData } = storage.from("pin-catalogue").getPublicUrl(publicPath);

  await deps.pinRepo.updatePin(image.pinhuntId, {
    imageUrl: publicUrlData.publicUrl,
    needsFrontImage: false,
  });

  const reviewed = image.status === "approved"
    ? image
    : await deps.userRepo.markContributedImageReviewed(image.id, reviewerId, { action: "approve" });
  // Only after the row is approved, so a failed publish keeps it for the retry.
  await discardRawOriginal(image, deps.serviceClient);
  return {
    ...reviewed,
    publicUrl: publicUrlData.publicUrl,
    replacedImageUrl: currentUrl && !currentIsOurs ? currentUrl : null,
  };
}

/**
 * Publishing a contributed pin photo into the live catalogue — shared by
 * admin approval (routes/pin-images.ts) and by admin/App Creator
 * contributions, which skip the review queue (routes/contribute-pin-image.ts).
 *
 * Copies the object from the private pin-contributed-images bucket into the
 * public pin-catalogue bucket with the PinHunt watermark burned in
 * (services/watermark.ts), writes pins.image_url, and marks the
 * pin_images row approved. Known v1 gap: no cross-step transaction — a
 * failure between the storage copy and the DB writes can leave an orphaned
 * public-bucket object (low-volume admin action, acceptable for now).
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
import { watermarkPinPhoto } from "./watermark";

export async function publishContributedImage(
  image: ContributedPinImage,
  reviewerId: string,
  deps: { serviceClient: SupabaseClient; userRepo: IUserPinRepository; pinRepo: PinRepository },
): Promise<ContributedPinImage & { publicUrl: string }> {
  if (!image.pinhuntId) {
    throw new Error("Contributed image is missing its linked pin.");
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

  const publicPath = `${image.pinId}/contributed-${image.id}.jpg`;
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

  const reviewed = await deps.userRepo.markContributedImageReviewed(image.id, reviewerId, { action: "approve" });
  return { ...reviewed, publicUrl: publicUrlData.publicUrl };
}

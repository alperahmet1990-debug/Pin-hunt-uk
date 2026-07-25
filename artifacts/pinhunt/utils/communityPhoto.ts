/**
 * communityPhoto — compress and upload photos for community posts.
 *
 * Shared by every flow that uploads to the `community-photos` bucket
 * (create post, edit post / photo replacement) so all paths stay under
 * the 5 MB bucket limit and fail loudly rather than silently.
 *
 * Compression settings intentionally match `submissionImage.ts`.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

/** Maximum pixel dimension for the longer edge of a community photo. */
const MAX_DIMENSION = 1400;
/** JPEG quality 0–1 (0.8 preserves enough detail for pin photos). */
const JPEG_QUALITY = 0.8;

/**
 * Compress a local image URI to stay well under the 5 MB bucket limit.
 * Always outputs JPEG so the mime type and size stay predictable.
 */
export async function compressPhoto(uri: string): Promise<string> {
  // Pass an empty actions array — manipulateAsync still re-encodes at the
  // given quality, which alone is enough to bring most phone photos under 5 MB.
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  // If the image is still very large in pixel terms, do a second pass with resize.
  const longestSide = Math.max(result.width, result.height);
  if (longestSide > MAX_DIMENSION) {
    const resize = result.width >= result.height
      ? { width: MAX_DIMENSION }
      : { height: MAX_DIMENSION };
    const resized = await ImageManipulator.manipulateAsync(
      result.uri,
      [{ resize }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    return resized.uri;
  }
  return result.uri;
}

/**
 * Compress and upload a single local photo URI to the `community-photos`
 * bucket. Returns the public URL. Throws on failure — callers must surface
 * the failure to the user (e.g. "N photos couldn't be uploaded").
 */
export async function uploadCommunityPhoto(
  userId: string,
  uri: string,
  index: number,
): Promise<string> {
  // Compress first so the file reliably fits within the 5 MB bucket limit.
  const compressedUri = await compressPhoto(uri);

  const path = `${userId}/${Date.now()}-${index}.jpg`;

  // React Native / Expo: fetch().blob() does not upload correctly to Supabase
  // Storage. FormData with a typed file descriptor is the reliable pattern.
  const formData = new FormData();
  formData.append('file', { uri: compressedUri, name: `photo-${index}.jpg`, type: 'image/jpeg' } as unknown as Blob);

  const { error } = await supabase.storage
    .from('community-photos')
    .upload(path, formData, { upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('community-photos').getPublicUrl(path);
  return data.publicUrl;
}

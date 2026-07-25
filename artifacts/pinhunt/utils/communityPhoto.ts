/**
 * communityPhoto — compress and upload photos for community posts.
 *
 * Shared by every flow that uploads to the `community-photos` bucket
 * (create post, edit post / photo replacement) so all paths stay under
 * the 5 MB bucket limit and fail loudly rather than silently.
 *
 * Compression settings intentionally match `submissionImage.ts`.
 */
import { Platform } from 'react-native';
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
/**
 * Web-only: compress via a plain canvas. expo-image-manipulator's web
 * implementation is unreliable (rejects with a raw HTMLCanvasElement),
 * so we do the resize + JPEG re-encode ourselves.
 */
async function compressPhotoWeb(uri: string): Promise<Blob> {
  const sourceBlob = await (await fetch(uri)).blob();

  // Decode: prefer createImageBitmap (applies EXIF orientation via
  // 'from-image'); fall back to an <img> element where unavailable.
  let source: ImageBitmap | HTMLImageElement;
  let cleanup: () => void = () => {};
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(sourceBlob, { imageOrientation: 'from-image' });
    source = bitmap;
    cleanup = () => bitmap.close();
  } else {
    const objectUrl = URL.createObjectURL(sourceBlob);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      source = img;
      cleanup = () => URL.revokeObjectURL(objectUrl);
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
      throw e;
    }
  }

  try {
    const srcWidth = source.width;
    const srcHeight = source.height;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(srcWidth, srcHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(srcWidth * scale);
    canvas.height = Math.round(srcHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size === 0) throw new Error('Photo could not be encoded');
    return blob;
  } finally {
    cleanup();
  }
}

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
  const path = `${userId}/${Date.now()}-${index}.jpg`;

  // Platform-specific compression + upload bodies:
  // - Web: expo-image-manipulator is unreliable and the RN FormData
  //   file-descriptor trick silently uploads a 0-byte file — compress via
  //   canvas and upload a real Blob.
  // - Native: fetch().blob() does not upload correctly to Supabase Storage;
  //   FormData with a typed file descriptor is the reliable pattern.
  let body: Blob | FormData;
  if (Platform.OS === 'web') {
    body = await compressPhotoWeb(uri);
  } else {
    const compressedUri = await compressPhoto(uri);
    const formData = new FormData();
    formData.append('file', { uri: compressedUri, name: `photo-${index}.jpg`, type: 'image/jpeg' } as unknown as Blob);
    body = formData;
  }

  const { error } = await supabase.storage
    .from('community-photos')
    .upload(path, body, { upsert: false, contentType: 'image/jpeg' });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('community-photos').getPublicUrl(path);
  return data.publicUrl;
}

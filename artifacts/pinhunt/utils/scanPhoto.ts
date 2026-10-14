/**
 * scanPhoto — shrink a scan photo before it is sent for identification
 * (UX-050, #114). Phone cameras produce several MB per photo; the vision
 * models don't need that, and a smaller JPEG uploads in a fraction of the
 * time on mobile data.
 *
 * Native uses expo-image-manipulator. Web uses a plain canvas, because
 * expo-image-manipulator is unreliable on web (see utils/communityPhoto.ts).
 */
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Longest edge sent for identification. If the accuracy comparison shows a
 * drop at this size, raise this value (maintainer review, 12 Oct 2026).
 */
export const SCAN_MAX_EDGE = 1024;
/** JPEG quality 0–1 for the identification upload. */
export const SCAN_JPEG_QUALITY = 0.8;

export interface ScanPhoto {
  base64: string;
  mimeType: 'image/jpeg';
}

/**
 * The size to scale a width × height photo to so its longest edge is at most
 * SCAN_MAX_EDGE, keeping the aspect ratio. Null when it is already small
 * enough (or the size is unknown), so it is only re-encoded, never enlarged.
 */
export function scanTargetSize(width: number | undefined, height: number | undefined): { width: number; height: number } | null {
  if (!width || !height) return null;
  const longest = Math.max(width, height);
  if (longest <= SCAN_MAX_EDGE) return null;
  const scale = SCAN_MAX_EDGE / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function prepareNative(uri: string, width?: number, height?: number): Promise<ScanPhoto> {
  const target = scanTargetSize(width, height);
  const result = await ImageManipulator.manipulateAsync(
    uri,
    // A single-dimension resize keeps the aspect ratio exactly.
    target ? [{ resize: target.width >= target.height ? { width: target.width } : { height: target.height } }] : [],
    { compress: SCAN_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!result.base64) throw new Error('Photo could not be encoded');
  return { base64: result.base64, mimeType: 'image/jpeg' };
}

async function prepareWeb(uri: string): Promise<ScanPhoto> {
  const sourceBlob = await (await fetch(uri)).blob();

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
    const size = scanTargetSize(source.width, source.height) ?? { width: source.width, height: source.height };
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const dataUrl = canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (!dataUrl.startsWith('data:image/jpeg') || !base64) throw new Error('Photo could not be encoded');
    return { base64, mimeType: 'image/jpeg' };
  } finally {
    cleanup();
  }
}

/**
 * Shrink a picked or captured photo for identification: longest edge at most
 * SCAN_MAX_EDGE, JPEG at SCAN_JPEG_QUALITY. Width and height come from the
 * picker asset on native; web reads them from the decoded image.
 */
export function prepareScanPhoto(uri: string, width?: number, height?: number): Promise<ScanPhoto> {
  return Platform.OS === 'web' ? prepareWeb(uri) : prepareNative(uri, width, height);
}

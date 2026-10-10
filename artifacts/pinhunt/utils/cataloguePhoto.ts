/**
 * cataloguePhoto — upload a photo picked in the app as a catalogue image.
 *
 * Every PinHunt-owned photo that goes public carries the PinHunt watermark,
 * which is burned in server-side (POST /admin/catalogue-photos, App Creator
 * only). So admin screens (Pin Editor, Missing Images) send photos through
 * the API server instead of uploading straight to Storage. Photos set by
 * pasting a URL don't go through here and aren't watermarked.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { API_BASE } from '@/lib/apiBase';

/** Read an image URI as base64 — local files on device, or fetched (web, signed URLs). */
async function readAsBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web' && !/^(https?|blob|data):/.test(uri)) {
    // fetch(localUri).blob() is unreliable in Expo Go on device.
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** Watermark + store a pin photo; returns the public URL to save on the pin. */
export async function uploadCataloguePhoto(
  uri: string,
  pinhuntId: string,
  side: 'front' | 'back',
  accessToken: string | undefined,
): Promise<string> {
  if (!accessToken) throw new Error('Sign in again to upload photos.');
  const imageBase64 = await readAsBase64(uri);
  const res = await fetch(`${API_BASE}/admin/catalogue-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ pinhuntId, side, imageBase64 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
  return data.publicUrl as string;
}

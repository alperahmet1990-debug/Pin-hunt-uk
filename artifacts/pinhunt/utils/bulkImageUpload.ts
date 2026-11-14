/**
 * Admin Bulk Image Matcher — reading picked/dropped photos and uploading
 * them to a batch (POST /admin/bulk-images/batches/:id/items).
 *
 * Web is the main surface (drag-and-drop, hundreds of files). Following
 * .agents/memory/expo-web-uploads.md, web never uses FormData file
 * descriptors or expo-image-manipulator: files are resized with
 * createImageBitmap → canvas → JPEG. Each file is also hashed as picked, so
 * the server recognises the same photo dropped again after an interruption.
 *
 * Uploads run a few at a time; one failure doesn't stop the rest.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { API_BASE } from '@/lib/apiBase';

export interface PendingUpload {
  key: string;
  name: string;
  /** Web File, or a native image URI. */
  source: File | string;
}

export type UploadOutcome = 'uploaded' | 'duplicate' | 'failed';

const MAX_SIDE = 2400;
const UPLOAD_CONCURRENCY = 3;

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** Web: resize to at most MAX_SIDE px, JPEG, EXIF orientation applied. */
async function prepareWebFile(file: File): Promise<{ base64: string; sha256: string | null }> {
  let sha256: string | null = null;
  try {
    sha256 = toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  } catch { /* insecure context: the server hashes instead */ }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', 0.9));
  return { base64: await blobToBase64(blob), sha256 };
}

async function prepareNative(uri: string): Promise<{ base64: string; sha256: null }> {
  const out = await ImageManipulator.manipulateAsync(uri, [], { // the server caps the size
    compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  if (!out.base64) throw new Error('Could not read the photo.');
  return { base64: out.base64, sha256: null };
}

export function filesToUploads(files: Iterable<File>): PendingUpload[] {
  return [...files]
    .filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name))
    .map((f) => ({ key: `${f.name}:${f.size}:${f.lastModified}`, name: f.name, source: f }));
}

/** Open a multi-select file chooser (web) or the photo library (native). */
export async function pickPhotos(): Promise<PendingUpload[]> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = () => resolve(filesToUploads(input.files ?? []));
      input.click();
    });
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 100, quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.map((a, i) => ({ key: `${a.uri}:${i}`, name: a.fileName ?? `photo-${i + 1}.jpg`, source: a.uri }));
}

async function uploadOne(batchId: string, token: string, upload: PendingUpload): Promise<UploadOutcome> {
  const prepared = typeof upload.source === 'string'
    ? await prepareNative(upload.source)
    : await prepareWebFile(upload.source);
  const res = await fetch(`${API_BASE}/admin/bulk-images/batches/${batchId}/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: prepared.base64, filename: upload.name, sourceSha256: prepared.sha256 ?? undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  return data.duplicate ? 'duplicate' : 'uploaded';
}

/** Upload a list with limited concurrency, reporting each outcome as it lands. */
export async function uploadAll(
  batchId: string,
  token: string,
  uploads: PendingUpload[],
  onResult: (key: string, outcome: UploadOutcome, error?: string) => void,
): Promise<void> {
  const queue = [...uploads];
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      try {
        onResult(u.key, await uploadOne(batchId, token, u));
      } catch (e) {
        onResult(u.key, 'failed', e instanceof Error ? e.message : 'Upload failed');
      }
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
}

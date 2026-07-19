/**
 * submissionImage — pick, compress, and prepare images for pin submissions.
 *
 * Keeps camera/library access and compression logic out of screens.
 * The repository handles the actual Supabase Storage upload.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert, Platform } from 'react-native';

export type ImageSource = 'camera' | 'library';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Maximum pixel dimension for the longer edge of a submission image. */
const MAX_DIMENSION = 1400;
/** JPEG quality 0–1 (0.8 preserves enough detail to read pin back markings). */
const JPEG_QUALITY = 0.8;

/**
 * Open the camera or photo library, compress the result to a sensible
 * mobile size, and return the compressed local URI.
 *
 * Returns `null` if the user cancels or denies permission.
 */
export async function pickSubmissionImage(source: ImageSource): Promise<PickedImage | null> {
  // ── Permission ───────────────────────────────────────────────────────────────
  if (source === 'camera') {
    if (Platform.OS === 'web') {
      // Web has no camera API via expo-image-picker — fall back to library.
      source = 'library';
    } else {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera permission required',
          'Please allow camera access in your device settings to photograph pins.',
        );
        return null;
      }
    }
  }

  // ── Launch picker ─────────────────────────────────────────────────────────────
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: false,
          quality: 1, // take at max quality; we compress manually below
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: false,
          quality: 1,
        });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];

  // ── Compress ──────────────────────────────────────────────────────────────────
  const { width, height } = asset;
  const longestSide = Math.max(width, height);
  const needsResize = longestSide > MAX_DIMENSION;

  const resizeAction: ImageManipulator.Action[] = needsResize
    ? [{ resize: width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION } }]
    : [];

  const compressed = await ImageManipulator.manipulateAsync(
    asset.uri,
    resizeAction,
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  return {
    uri: compressed.uri,
    width: compressed.width,
    height: compressed.height,
  };
}

/**
 * Upload a local image URI to Supabase Storage.
 *
 * Uses expo-file-system to read the file as base64 (works reliably in
 * Expo Go on device — `fetch(localUri).blob()` does not).
 *
 * Returns the storage path on success so the caller can generate a URL.
 */
export async function uploadLocalImageToStorage(
  localUri: string,
  bucket: string,
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storageClient: any,
): Promise<void> {
  // Read file as base64 string via expo-file-system
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → Uint8Array without any extra packages
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // List available buckets to help diagnose name mismatches
  const { data: buckets } = await storageClient.listBuckets();
  const bucketNames = buckets?.map((b: { name: string }) => b.name).join(', ') ?? 'none';

  const { error } = await storageClient
    .from(bucket)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    throw new Error(
      `Storage upload failed: ${error.message}\n\nTrying bucket: "${bucket}"\nAvailable buckets: ${bucketNames}`,
    );
  }
}

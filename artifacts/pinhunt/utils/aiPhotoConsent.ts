/**
 * Permission to send photos to third-party AI services (#501, LP-1).
 *
 * App Review Guideline 5.1.2(i): before a photo leaves the device for
 * OpenAI and Google Cloud Vision (identification) or Pixian (clean-up), the collector is told who
 * receives it and agrees. Stored per user. The stored value is the copy
 * version, so changing the copy (or the providers) asks again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Bump when the sheet's copy or the provider list changes. */
export const AI_PHOTO_CONSENT_VERSION = '2026-11-09';

export const aiPhotoConsentKey = (userId: string) => `@pinhunt_ai_photo_consent_v1:${userId}`;

/** Copy agreed on #501 (6 Nov 2026). Use exactly. */
export const AI_PHOTO_CONSENT_COPY = {
  title: 'Before we check your photo',
  body:
    'To identify your pin, PinHunt sends your photo to OpenAI and Google Cloud Vision. To tidy up photos you add to the catalogue, we send them to Pixian. Please photograph only the pin, and avoid faces, addresses or other personal details.',
  storage: 'PinHunt doesn’t save scan photos. Photos you submit are kept with your submission.',
  allow: 'Allow and continue',
  decline: 'Not now',
} as const;

/** Signed-out checks share one key, so they still ask. */
const keyFor = (userId: string | null | undefined) => aiPhotoConsentKey(userId || 'signed-out');

export async function hasAiPhotoConsent(userId: string | null | undefined): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === AI_PHOTO_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export async function saveAiPhotoConsent(userId: string | null | undefined): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), AI_PHOTO_CONSENT_VERSION);
  } catch {
    // Not remembered: the sheet simply asks again next time.
  }
}

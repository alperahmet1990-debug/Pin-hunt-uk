/**
 * scanPhotoHandoff — carries the scan photo from the scan result's
 * "Add your photo" into /contribute-image/[pinId]?from=scan, so the
 * collector can offer the photo they just took instead of taking another.
 *
 * In memory only: a photo is too big for route params, and it should not
 * outlive the app session. One photo at a time, for one pin and one signed-in
 * user: it is only handed back to the user who scanned it, so a different
 * account signing in on the same device never sees it. A newer scan replaces
 * it, and a successful submit clears it. The contribute screen reads it
 * without clearing it, so going back and forth keeps it available.
 */

export interface HandoffPhoto {
  pinId: string;
  /** The signed-in user who scanned it (undefined when signed out). */
  userId: string | undefined;
  uri: string;
  base64: string;
  mimeType: string;
}

let current: HandoffPhoto | null = null;

export function setScanPhotoForContribution(photo: HandoffPhoto): void {
  current = photo;
}

/** The scan photo for this pin and this user, if the latest hand-off was for them. */
export function getScanPhotoForContribution(pinId: string | undefined, userId: string | undefined): HandoffPhoto | null {
  return current && pinId && current.pinId === pinId && current.userId === userId ? current : null;
}

export function clearScanPhotoForContribution(): void {
  current = null;
}

/**
 * scanPhotoHandoff — carries the scan photo from the scan result's
 * "Add your photo" into /contribute-image/[pinId]?from=scan, so the
 * collector can offer the photo they just took instead of taking another.
 *
 * In memory only: a photo is too big for route params, and it should not
 * outlive the app session. One photo at a time, for one pin; a newer scan
 * replaces it. The contribute screen reads it without clearing it, so going
 * back and forth keeps it available.
 */

export interface HandoffPhoto {
  pinId: string;
  uri: string;
  base64: string;
  mimeType: string;
}

let current: HandoffPhoto | null = null;

export function setScanPhotoForContribution(photo: HandoffPhoto): void {
  current = photo;
}

/** The scan photo for this pin, if the latest hand-off was for it. */
export function getScanPhotoForContribution(pinId: string | undefined): HandoffPhoto | null {
  return current && pinId && current.pinId === pinId ? current : null;
}

export function clearScanPhotoForContribution(): void {
  current = null;
}

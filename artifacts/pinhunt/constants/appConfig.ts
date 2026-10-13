/**
 * Launch-time switches for Profile rows (issue #41).
 *
 * Hidden rows are kept in the code and simply gated here, so re-enabling one
 * is a one-line change.
 */

/** Support address for Send Feedback. Empty string hides the row. */
export const SUPPORT_EMAIL: string = '';

/** Rate the App row: re-enable at store launch, once a store listing exists. */
export const RATE_APP_ENABLED = false;

/** Export Collection row (plain-text share of Owned / For Trade / ISO pins). */
export const EXPORT_COLLECTION_ENABLED = true;

export function feedbackMailtoUrl(email: string = SUPPORT_EMAIL, subject = 'PinHunt feedback'): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  return `mailto:${trimmed}?subject=${encodeURIComponent(subject)}`;
}

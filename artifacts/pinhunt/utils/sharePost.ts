/**
 * Share a community post to Facebook (or anywhere) via the native share sheet.
 *
 * No Facebook API integration — we generate a public PinHunt URL, a suggested
 * post text and a branded share image, then hand everything to the device's
 * native share functionality (Web Share API on web/iPhone, Share on native).
 */
import { Platform, Share } from 'react-native';
import type { CommunityPost } from '@workspace/pin-repository';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:8080/api';

/** Any community post with a public slug can be shared. */
export function isShareablePost(post: CommunityPost): boolean {
  return !!post.publicSlug;
}

export function getPublicPostUrl(post: CommunityPost): string {
  return `${API_BASE}/p/${post.publicSlug}`;
}

export function getShareImageUrl(post: CommunityPost): string {
  return `${getPublicPostUrl(post)}/share-image`;
}

const HEADING: Record<string, string> = {
  for_trade: 'FOR TRADE',
  for_sale: 'FOR SALE',
  in_search_of: 'IN SEARCH OF',
  new_pickup: 'NEW PICKUP',
  discussion: 'FROM THE PINHUNT COMMUNITY',
};

/** Facebook-friendly suggested post text. */
export function buildShareText(post: CommunityPost): string {
  const lines: string[] = [];
  const subject = post.linkedPin?.title ?? post.body.slice(0, 60);
  lines.push(`${HEADING[post.postType] ?? 'PIN POST'} – ${subject}`);
  if (post.priceText) lines.push(post.priceText);
  if (post.lookingFor) lines.push(`Looking for: ${post.lookingFor}`);
  if (post.locationText) lines.push(post.locationText);
  lines.push(
    post.postType === 'for_trade' || post.postType === 'for_sale' || post.postType === 'in_search_of'
      ? 'View the pins or make an offer on PinHunt:'
      : 'See the full post on PinHunt:',
  );
  lines.push(getPublicPostUrl(post));
  return lines.join('\n');
}

/** Fire-and-forget share tracking (records the flow opened, not a FB publish). */
export function recordShareClick(post: CommunityPost): void {
  if (!post.publicSlug) return;
  fetch(`${API_BASE}/p/${post.publicSlug}/share-click`, { method: 'POST' }).catch(() => {});
}

export type ShareOutcome = 'shared' | 'fallback' | 'cancelled';

/**
 * Open the native share sheet with image + text + URL where supported.
 * Returns 'fallback' when no native share is available (caller shows fallback UI).
 */
export async function sharePostNative(post: CommunityPost): Promise<ShareOutcome> {
  const text = buildShareText(post);
  const url = getPublicPostUrl(post);

  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator) : undefined;
    if (!nav?.share) return 'fallback';
    // Try to include the generated share image where file sharing is supported.
    let files: File[] | undefined;
    try {
      const resp = await fetch(getShareImageUrl(post));
      if (resp.ok) {
        const blob = await resp.blob();
        const file = new File([blob], 'pinhunt-post.jpg', { type: 'image/jpeg' });
        if (nav.canShare?.({ files: [file] })) files = [file];
      }
    } catch { /* share without the image */ }
    try {
      await nav.share({
        title: text.split('\n')[0],
        text,
        url: files ? undefined : url,
        ...(files ? { files } : {}),
      } as ShareData);
      return 'shared';
    } catch (err) {
      // AbortError = user dismissed the sheet
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      return 'fallback';
    }
  }

  // Native iOS/Android: system share sheet with the text + URL.
  try {
    const result = await Share.share(
      Platform.OS === 'ios' ? { message: text, url } : { message: text },
    );
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    return 'fallback';
  }
}

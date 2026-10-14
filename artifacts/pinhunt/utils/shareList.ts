/**
 * Share my ISO / For Trade list (UX-034, #146): the plain text that goes to
 * the native share sheet (WhatsApp, Facebook groups…). Pin names and the
 * collector's @username only: no location, email or other personal details.
 * Until list pages are public on the web, it ends with the username instead
 * of a link (maintainer decision, 14 Oct 2026).
 */
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export type ShareListKind = 'iso' | 'for_trade';

/** Most pins listed before "…and N more". */
export const SHARE_LIST_LIMIT = 30;

const HEADING: Record<ShareListKind, string> = {
  iso: 'My ISO on PinHunt',
  for_trade: 'My For Trade pins on PinHunt',
};

// Number-aware, so "Classic 16" comes before "Classic 116".
const collator = new Intl.Collator(undefined, { numeric: true });

/** The share text, or null when the list is empty. */
export function buildShareListText(kind: ShareListKind, titles: string[], username?: string | null): string | null {
  const names = titles.map(t => t.trim()).filter(Boolean).sort(collator.compare);
  if (names.length === 0) return null;
  const shown = names.slice(0, SHARE_LIST_LIMIT).map(t => `• ${t}`);
  const more = names.length - shown.length;
  const lines = [`${HEADING[kind]} (${names.length}):`, ...shown];
  if (more > 0) lines.push(`…and ${more} more`);
  const handle = username?.trim();
  lines.push('', handle ? `Find me on PinHunt: @${handle}` : 'Find me on PinHunt');
  return lines.join('\n');
}

/** Title for the share sheet. */
export function shareListTitle(kind: ShareListKind): string {
  return kind === 'iso' ? 'My ISO' : 'My For Trade pins';
}

/**
 * Opens the share sheet. Browsers without one (most desktop browsers) get
 * the text copied instead, so the button never silently does nothing.
 * Returns what happened.
 */
export async function shareOrCopy(message: string, title: string, os: string = Platform.OS): Promise<'shared' | 'copied' | 'failed'> {
  const canShare = os !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  if (canShare) {
    try {
      await Share.share({ message, title });
      return 'shared';
    } catch {
      // Closing the sheet rejects on some platforms; nothing to report.
      return 'failed';
    }
  }
  try {
    await Clipboard.setStringAsync(message);
    return 'copied';
  } catch {
    return 'failed';
  }
}

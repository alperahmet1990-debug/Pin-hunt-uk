import type { CollectionStatus } from '@/types/pin';

/**
 * The one-line collection summary on Pin detail. For Trade pins are owned
 * pins (as on My Collection, Sets and Home), so they report their quantity;
 * ISO stays a separate, wanted state.
 */
export function collectionStatusLine(status: CollectionStatus | undefined, quantity = 1): string | null {
  const qty = Math.max(1, quantity);
  switch (status) {
    case 'owned':
      return `You own ${qty}`;
    case 'for_trade':
      return qty === 1 ? 'You own 1 · for trade' : `You own ${qty} · all for trade`;
    case 'wanted':
      return 'On your ISO';
    default:
      return null;
  }
}

/**
 * App-level type definitions.
 *
 * Catalogue pin data (what a pin IS) comes from @workspace/pin-repository.
 * Only app-specific types live here — user collection state and UI enums.
 */

// Re-export for convenience so existing imports don't all need updating at once
export type { CataloguePin as Pin } from '@workspace/pin-repository';

/** User's relationship to a pin in their local collection. */
export type CollectionStatus = 'owned' | 'wanted' | 'for_trade' | 'none';

/** The three active pin manufacturers — used by FilterBar and search UI. */
export type Brand = 'Disney Parks' | 'Loungefly' | 'BoxLunch';

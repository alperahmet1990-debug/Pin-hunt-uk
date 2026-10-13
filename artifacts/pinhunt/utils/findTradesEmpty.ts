/**
 * Copy for Find Trades when there is nothing to show (UX-054, #201).
 * "Nothing found" means different things depending on whether the collector
 * already has pins on their ISO, so the message and actions follow that.
 * Wording follows docs/design/glossary.md (ISO, For Trade).
 */
export type FindTradesEmptyAction = 'addToIso' | 'forTradePosts';

export interface FindTradesEmptyState {
  title: string;
  body: string;
  primary: { label: string; action: FindTradesEmptyAction };
  secondary?: { label: string; action: FindTradesEmptyAction };
}

export function findTradesEmptyState(isoCount: number): FindTradesEmptyState {
  if (isoCount <= 0) {
    return {
      title: 'Nothing to trade for yet',
      body: "Add pins to your ISO and we'll show you who has them for trade. Pins you own and your Boards help us suggest more.",
      primary: { label: 'Add to your ISO', action: 'addToIso' },
    };
  }
  const pins = isoCount === 1 ? 'your ISO pin' : `your ${isoCount} ISO pins`;
  return {
    title: 'No matches yet',
    body: `No one has ${pins} for trade yet. We'll show them here as soon as a collector lists one.`,
    primary: { label: 'See For Trade posts', action: 'forTradePosts' },
    secondary: { label: 'Add more to your ISO', action: 'addToIso' },
  };
}

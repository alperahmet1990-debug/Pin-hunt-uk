import type { CollectionMap } from '@/types/collection';

type Titles = Record<string, string | undefined>;

const SECTIONS: { status: 'owned' | 'for_trade' | 'wanted'; heading: string }[] = [
  { status: 'owned', heading: 'Owned' },
  { status: 'for_trade', heading: 'For Trade' },
  { status: 'wanted', heading: 'ISO (In Search Of)' },
];

/**
 * Plain-text export of the collection, grouped Owned / For Trade / ISO.
 * ISO (`wanted`) and For Trade (`for_trade`) stay separate sections.
 * Returns null when there is nothing to export.
 */
export function buildCollectionExportText(collection: CollectionMap, titles: Titles): string | null {
  const blocks: string[] = [];
  for (const { status, heading } of SECTIONS) {
    const lines = Object.values(collection)
      .filter(e => e.status === status)
      .map(e => {
        const title = titles[e.pinId] ?? e.pinId;
        const qty = e.quantity > 1 ? ` x${e.quantity}` : '';
        return `- ${title} (${e.pinId})${qty}`;
      })
      .sort((a, b) => a.localeCompare(b));
    if (lines.length) blocks.push(`${heading} (${lines.length})\n${lines.join('\n')}`);
  }
  if (!blocks.length) return null;
  return `My PinHunt collection\n\n${blocks.join('\n\n')}`;
}

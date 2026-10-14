/**
 * A large, deterministic demo catalogue and collection (UX-051, #159) for
 * measuring how the app copes with an experienced collector's thousands of
 * pins. Mock data only: used by the jest benchmark and, in demo mode, when
 * EXPO_PUBLIC_DEMO_PINS is set (never in a real build, which always has
 * Supabase configured).
 */
import type { CataloguePin } from '@workspace/pin-repository';
import type { CollectionStatus } from '@/types/pin';
import type { CollectionEntry } from '@/types/collection';

const CHARACTERS = ['Mickey Mouse', 'Minnie Mouse', 'Stitch', 'Dumbo', 'Tinker Bell', 'Donald Duck', 'Goofy', 'Belle', 'Ariel', 'Simba'];
const PARKS = ['Disneyland Paris', 'Disney Store UK', 'Walt Disney World', 'Disneyland'];
const EDITIONS = ['Open Edition', 'Limited Edition', 'Limited Release'];

/** `count` pins in sets of `setSize`, ids `lf-00001`… */
export function buildLargeCatalogue(count = 2000, setSize = 12): CataloguePin[] {
  return Array.from({ length: count }, (_, i) => {
    const setIndex = Math.floor(i / setSize);
    const character = CHARACTERS[i % CHARACTERS.length];
    const edition = EDITIONS[i % EDITIONS.length];
    const year = 2005 + (setIndex % 20);
    return {
      id: `lf-${String(i + 1).padStart(5, '0')}`,
      title: `${character} ${['Classic', 'Sparkle', 'Holiday', 'Park Icon', 'Anniversary'][i % 5]} ${i + 1}`,
      brand: 'Disney Parks',
      collection: `Fixture Set ${String(setIndex + 1).padStart(3, '0')}`,
      characters: [character],
      categories: [],
      releaseDate: `${year}-${String((i % 12) + 1).padStart(2, '0')}-01`,
      releaseYear: year,
      currency: 'GBP',
      limitedEditionSize: edition === 'Limited Edition' ? 500 + (i % 7) * 250 : undefined,
      origin: PARKS[i % PARKS.length],
      edition,
      externalIdentifiers: {},
      verificationStatus: 'needs_source_verification' as const,
      status: 'active' as const,
      isUserSubmitted: false,
    } as CataloguePin;
  });
}

/**
 * A collector holding most of the catalogue: of every 20 pins, 13 owned,
 * 3 for trade and 2 on the ISO (the rest untouched).
 */
export function buildLargeCollection(pins: Pick<CataloguePin, 'id'>[]): Record<string, CollectionEntry> {
  const out: Record<string, CollectionEntry> = {};
  pins.forEach((p, i) => {
    const slot = i % 20;
    const status: CollectionStatus | null = slot < 13 ? 'owned' : slot < 16 ? 'for_trade' : slot < 18 ? 'wanted' : null;
    if (!status) return;
    out[p.id] = {
      pinId: p.id,
      status,
      quantity: slot === 0 ? 2 : 1,
      notes: '',
      dateAdded: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    };
  });
  return out;
}

import type { CataloguePin, PinRepository } from "@workspace/pin-repository";

/** Most catalogue candidates handed to the ranking stage. */
export const MAX_CANDIDATES = 350;

/**
 * Find candidate pins for what the vision model saw in the photo.
 *
 * The catalogue is ~13k pins — far too many to hand to the model — so we
 * first describe the pin (stage 1), then search the catalogue by the
 * characters and keywords seen, and only rank those candidates (stage 2).
 *
 * The searches run in parallel (#349): one at a time they were up to ~26
 * database round trips in a row. Results are merged in the same priority
 * order as before — character matches first, then terms in order — so the
 * candidate list doesn't change, only how long it takes to build.
 */
export async function findCandidates(
  repository: PinRepository,
  description: { characters: string[]; keywords: string[] },
  visionTerms: string[] = [],
): Promise<CataloguePin[]> {
  const safe = (p: Promise<CataloguePin[]>) => p.catch(() => [] as CataloguePin[]);

  // Character matches are the strongest signal.
  const characterSearches = description.characters
    .slice(0, 4)
    .map((character) => safe(repository.searchPins("", { status: "active", character, limit: 120 })));
  // Character names + keywords against title/brand/collection.
  // Vision-derived terms (OCR text, web entities) go right after the AI
  // keywords — text read off the pin is a strong catalogue signal.
  const termSearches = [...description.characters, ...description.keywords, ...visionTerms]
    .slice(0, 14)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .map((term) => safe(repository.searchPins(term, { status: "active", limit: 80 })));

  const results = await Promise.all([...characterSearches, ...termSearches]);
  const byId = new Map<string, CataloguePin>();
  for (const pins of results) {
    for (const p of pins) if (!byId.has(p.id)) byId.set(p.id, p);
    if (byId.size >= MAX_CANDIDATES) break;
  }
  // Last resort so the scan still returns something rather than erroring.
  if (byId.size === 0) {
    for (const p of await repository.searchPins("", { status: "active", limit: 300 })) byId.set(p.id, p);
  }
  return [...byId.values()].slice(0, MAX_CANDIDATES);
}

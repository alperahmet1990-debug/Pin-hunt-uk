import { localDuplicateCandidates, setSuggestions } from '../suggestPin';
import type { CataloguePin } from '@workspace/pin-repository';

// UX-011 (#121): set suggestions and the already-in-the-catalogue check.
const SETS = ['Park Icons', 'Halloween 2023', 'Disneyland Paris 30th', 'Iconic Parks'];

describe('setSuggestions', () => {
  it('suggests sets starting with the text first, then containing it', () => {
    expect(setSuggestions(SETS, 'park')).toEqual(['Park Icons', 'Iconic Parks']);
  });
  it('is case- and space-insensitive and respects the limit', () => {
    expect(setSuggestions(SETS, '  HALLOWEEN ')).toEqual(['Halloween 2023']);
    expect(setSuggestions(SETS, 'a', 2)).toHaveLength(2);
  });
  it('suggests nothing for empty text or an exact set name', () => {
    expect(setSuggestions(SETS, '')).toEqual([]);
    expect(setSuggestions(SETS, 'park icons')).toEqual([]);
  });
});

describe('localDuplicateCandidates', () => {
  const pins = [
    { id: 'a', title: 'Dumbo Blue Sky' },
    { id: 'b', title: 'Castle Fireworks' },
    { id: 'c', title: 'Dumbo Circus Night' },
  ] as CataloguePin[];
  it('matches titles that contain every typed word', () => {
    expect(localDuplicateCandidates(pins, 'dumbo').map(p => p.id)).toEqual(['a', 'c']);
    expect(localDuplicateCandidates(pins, 'sky dumbo').map(p => p.id)).toEqual(['a']);
  });
  it('waits for at least three characters', () => {
    expect(localDuplicateCandidates(pins, 'du')).toEqual([]);
  });
});

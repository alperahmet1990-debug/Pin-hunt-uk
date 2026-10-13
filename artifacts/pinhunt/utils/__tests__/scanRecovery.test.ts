import { recoveryQuery, sharedCandidateSet } from '../scanRecovery';

const insights = (over: Partial<Parameters<typeof recoveryQuery>[0] & object> = {}) => ({
  characters: [], keywords: [], textOnPin: null, logos: [], webGuesses: [], ...over,
});

describe('recoveryQuery', () => {
  it('uses up to two recognised characters', () => {
    expect(recoveryQuery(insights({ characters: ['Stitch', ' Angel ', 'Lilo'] }))).toBe('Stitch Angel');
  });

  it('falls back to text on the pin, trimmed to a word boundary', () => {
    expect(recoveryQuery(insights({ textOnPin: '  Walt Disney World\n50th ' }))).toBe('Walt Disney World 50th');
    const long = 'Haunted Mansion Hitchhiking Ghosts Limited Edition 2024';
    const q = recoveryQuery(insights({ textOnPin: long }));
    expect(q.length).toBeLessThanOrEqual(40);
    expect(long.startsWith(q)).toBe(true);
    expect(q.endsWith(' ')).toBe(false);
  });

  it('is empty when the scan saw nothing useful', () => {
    expect(recoveryQuery(null)).toBe('');
    expect(recoveryQuery(insights())).toBe('');
  });
});

describe('sharedCandidateSet', () => {
  it('returns the set when the top two candidates agree', () => {
    expect(sharedCandidateSet(['Park Icons', 'Park Icons', 'Classics 2024'])).toBe('Park Icons');
  });

  it('is null when they differ or there is only one candidate', () => {
    expect(sharedCandidateSet(['Park Icons', 'Classics 2024'])).toBeNull();
    expect(sharedCandidateSet(['Park Icons'])).toBeNull();
    expect(sharedCandidateSet([null, null])).toBeNull();
  });
});

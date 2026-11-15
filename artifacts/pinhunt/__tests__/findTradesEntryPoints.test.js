// Find Trades must stay reachable from where collectors think about trading
// (UX-001, #107). Plain JS: reads source files, and the app tsconfig has no Node types.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const count = (file) =>
  (readFileSync(path.join(ROOT, file), 'utf8').match(/router\.push\(\s*['"]\/find-trades['"]/g) || []).length;

describe('Find Trades entry points', () => {
  it('Collection has one on the For Trade tab and one on the ISO tab', () => {
    expect(count('app/(tabs)/collection.tsx')).toBeGreaterThanOrEqual(2);
  });

  it('Community header has one', () => {
    expect(count('app/(tabs)/community.tsx')).toBeGreaterThanOrEqual(1);
  });

  it('Home no longer has one (maintainer decision, #604)', () => {
    // The maintainer approved removing the Find Trades tile from Home (#604):
    // Home now leads with the ISO and For trade tiles, which open the
    // Collection tabs that carry Find Trades (checked above). If Home gets an
    // entry point again, flip this back to "at least one".
    expect(count('app/(tabs)/index.tsx')).toBe(0);
  });
});

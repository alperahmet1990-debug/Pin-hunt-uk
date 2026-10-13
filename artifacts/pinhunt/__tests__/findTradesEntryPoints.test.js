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

  it('Home keeps at least one', () => {
    expect(count('app/(tabs)/index.tsx')).toBeGreaterThanOrEqual(1);
  });
});

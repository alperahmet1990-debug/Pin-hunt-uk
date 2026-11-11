// V1 scope (LP-7, #525): entry points to Nearby, in-person and international trading
// are gated by FEATURES flags. Plain JS: reads source files, and the app tsconfig has no Node types.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

describe('V1 scope flags', () => {
  it('default to off', () => {
    const src = read('constants/features.ts');
    expect(src).toMatch(/collectorsNearby:\s*false/);
    expect(src).toMatch(/inPersonTrading:\s*false/);
    expect(src).toMatch(/internationalTrading:\s*false/);
  });

  it('gates the Collectors Nearby button on Community', () => {
    const src = read('app/(tabs)/community.tsx');
    const gate = src.indexOf('FEATURES.collectorsNearby && (');
    expect(gate).toBeGreaterThan(-1);
    expect(src.indexOf("router.push('/nearby')")).toBeGreaterThan(gate);
  });

  it('gates the local, travel and international chips on collector profiles', () => {
    const src = read('app/collector/[username].tsx');
    expect(src).toContain('FEATURES.internationalTrading && profile.internationalTradingEnabled');
    expect(src).toContain('FEATURES.inPersonTrading && profile.openToLocalTrades');
    expect(src).toContain('FEATURES.inPersonTrading && profile.happyToTravel');
    expect(src).not.toMatch(/\{profile\.(openToLocalTrades|happyToTravel|internationalTradingEnabled) && \(/);
  });

  it('gates the Intl badge in Find Collectors', () => {
    expect(read('app/find-collectors.tsx')).toContain('FEATURES.internationalTrading && item.internationalTradingEnabled && (');
  });

  it('keeps the hidden routes registered', () => {
    const src = read('app/_layout.tsx');
    for (const name of ['nearby', 'sell/[pinId]', 'my-listings']) expect(src).toContain(`name="${name}"`);
  });
});

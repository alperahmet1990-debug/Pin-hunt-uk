// Marketplace entry points are hidden behind FEATURES.marketplaceListings (B-P1-23, #50).
// Plain JS: reads source files, and the app tsconfig has no Node types.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

describe('marketplaceListings flag', () => {
  it('defaults to off', () => {
    expect(read('constants/features.ts')).toMatch(/marketplaceListings:\s*false/);
  });

  it('gates the For Sale section and List for Sale entry on Pin detail', () => {
    const src = read('app/pin/[id].tsx');
    const gate = src.indexOf('FEATURES.marketplaceListings && (');
    expect(gate).toBeGreaterThan(-1);
    expect(src.indexOf('>For Sale<')).toBeGreaterThan(gate);
    expect(src.indexOf("pathname: '/sell/[pinId]'")).toBeGreaterThan(gate);
  });

  it('gates the My Marketplace Listings row on Profile', () => {
    const src = read('app/(tabs)/profile.tsx');
    const gate = src.indexOf('FEATURES.marketplaceListings && (');
    expect(gate).toBeGreaterThan(-1);
    expect(src.indexOf('My Marketplace Listings')).toBeGreaterThan(gate);
  });

  it('keeps the routes registered', () => {
    const src = read('app/_layout.tsx');
    expect(src).toContain('sell/[pinId]');
    expect(src).toContain('my-listings');
  });
});

import colors from '../colors';
import { CONTRAST_PAIRS, KNOWN_CONTRAST_GAPS, MIN_RATIO } from '../contrastPairs';

// UX-049 (#158): every documented text/background pair meets WCAG AA in
// light and dark, or is listed as a known gap awaiting a design decision.

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES = ['light', 'dark'] as const;
const gapFor = (id: string, scheme: string) => KNOWN_CONTRAST_GAPS.find(g => g.id === id && g.scheme === scheme);

describe('colour contrast table', () => {
  it('has unique ids and only real tokens', () => {
    const ids = CONTRAST_PAIRS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CONTRAST_PAIRS) {
      for (const scheme of SCHEMES) {
        expect(colors[scheme][p.fg]).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(colors[scheme][p.bg]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('every known gap names a pair in the table', () => {
    for (const g of KNOWN_CONTRAST_GAPS) expect(CONTRAST_PAIRS.map(p => p.id)).toContain(g.id);
  });

  const cases = CONTRAST_PAIRS.flatMap(p => SCHEMES.map(scheme => [p.id, scheme, p] as const));

  it.each(cases)('%s (%s) meets its WCAG AA minimum', (id, scheme, p) => {
    const ratio = contrast(colors[scheme][p.fg], colors[scheme][p.bg]);
    const gap = gapFor(id, scheme);
    if (gap) {
      // A known gap that now passes should come off the list…
      expect(ratio).toBeLessThan(MIN_RATIO[p.role]);
      // …and must not get worse than when it was recorded.
      expect(ratio).toBeGreaterThanOrEqual(gap.recorded - 0.01);
    } else {
      expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO[p.role]);
    }
  });
});

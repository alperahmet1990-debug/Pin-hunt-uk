import colors from '../colors';

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

describe('PrimaryActionBar secondary button contrast (homeInk on homeAqua)', () => {
  it.each(['light', 'dark'] as const)('%s scheme label is >= 4.5:1', scheme => {
    const t = colors[scheme];
    expect(contrast(t.homeInk, t.homeAqua)).toBeGreaterThanOrEqual(4.5);
  });

  it('documents the old failing pair (homeTeal on homeAqua, dark)', () => {
    expect(contrast(colors.dark.homeTeal, colors.dark.homeAqua)).toBeLessThan(4.5);
  });
});

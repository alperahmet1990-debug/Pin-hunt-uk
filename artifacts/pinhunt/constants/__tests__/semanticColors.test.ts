import colors, { semanticColors } from '../colors';

// Every semantic name and the existing token it must equal (UX-038a, #150).
const MAPPING: Array<[string, keyof typeof colors.light]> = [
  ['bg.canvas', 'homeBackground'],
  ['bg.surface', 'homeSurface'],
  ['bg.subtle', 'homeAqua'],
  ['bg.treasure', 'homeWarmSurface'],
  ['text.primary', 'homeInk'],
  ['text.muted', 'homeMuted'],
  ['text.onHero', 'homeHeroText'],
  ['text.onHeroMuted', 'homeHeroMuted'],
  ['line.default', 'homeLine'],
  ['line.treasure', 'homeWarmLine'],
  ['action.primary', 'homeCoral'],
  ['action.primaryDeep', 'homeCoralDeep'],
  ['accent.treasure', 'homeSand'],
  ['accent.treasureInk', 'homeSandInk'],
  ['accent.teal', 'homeTeal'],
  ['accent.tealSoft', 'homeTealSoft'],
  ['status.owned', 'owned'],
  ['status.wanted', 'wanted'],
  ['status.forTrade', 'forTrade'],
  ['danger', 'destructive'],
  ['shadow', 'homeShadow'],
];

const get = (obj: unknown, path: string) => path.split('.').reduce((o: any, k) => o?.[k], obj);
const leaves = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('semantic colour aliases (UX-038a)', () => {
  it.each(['light', 'dark'] as const)('%s: each alias is exactly its existing token', scheme => {
    const palette = colors[scheme];
    const tokens = semanticColors(palette);
    for (const [alias, token] of MAPPING) expect([alias, get(tokens, alias)]).toEqual([alias, palette[token]]);
  });

  it('every alias is covered by the mapping above (no untested names)', () => {
    expect(leaves(semanticColors(colors.light)).sort()).toEqual(MAPPING.map(([alias]) => alias).sort());
  });

  it('the approved Storybook values are unchanged (D-01)', () => {
    const t = semanticColors(colors.light);
    expect([t.bg.canvas, t.text.primary, t.action.primary, t.accent.treasure]).toEqual(['#FAF6F0', '#16424A', '#6C6FA0', '#8C3A5C']);
  });
});

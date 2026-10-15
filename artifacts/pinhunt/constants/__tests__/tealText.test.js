// UX-062 (#277): `homeTeal` is a fill (Continue Collecting, the Find Trades
// tile), never a text or icon colour. In Dark Side it is near-black teal
// (#103138), so type set in it vanished on dark cards. Deep teal type uses
// `homeInk`, which is the same teal in Light Side and near-white in Dark Side.
// Plain JS: reads source files, and the app tsconfig has no Node types.
const fs = require('node:fs');
const path = require('node:path');
const colors = require('../colors').default;

const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components'];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

// `color: colors.homeTeal`, `color={colors.homeTeal}`, `fg: colors.homeTeal`,
// a ternary branch ending in one of those, or a Chip/segment tone mapping.
const TEXT_USE = /\b(?:color|fg)\s*[:=]\s*\{?[^,;}\n]*\bcolors\.homeTeal\b(?!Soft)|case 'teal': return colors\.homeTeal\b/;

describe('deep teal is not used for text or icons (UX-062)', () => {
  it('homeInk is the same teal as homeTeal in Light Side, so swapping is invisible there', () => {
    expect(colors.light.homeInk).toBe(colors.light.homeTeal);
  });

  it('no screen or component sets text or an icon in homeTeal', () => {
    const offenders = DIRS.flatMap(d => sourceFiles(path.join(ROOT, d)))
      .flatMap(f => fs.readFileSync(f, 'utf8').split('\n')
        .map((line, i) => (TEXT_USE.test(line) ? `${path.relative(ROOT, f)}:${i + 1}` : null))
        .filter(Boolean));
    expect(offenders).toEqual([]);
  });
});

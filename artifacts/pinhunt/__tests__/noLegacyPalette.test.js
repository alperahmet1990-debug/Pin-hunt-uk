// UX-038b (#151): the shared components use the Storybook palette only, and
// the `seaGlass` switch between palettes is gone. Plain JS: reads source
// files, and the app tsconfig has no Node types.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATED = ['components/PinCard.tsx', 'components/BoardCard.tsx', 'components/Avatar.tsx', 'components/QuickAddSheet.tsx'];
// Golden Era tokens in constants/colors.ts (the status colours are shared, so not listed).
const GOLDEN_ERA = /\bcolors\.(text|tint|background|foreground|card|cardForeground|primary|primaryForeground|primaryGradientStart|primaryGradientEnd|secondary|secondaryForeground|muted|mutedForeground|accent|accentForeground|border|input|gold|radius)\b/;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('Storybook only in the shared components (UX-038b)', () => {
  it.each(MIGRATED)('%s uses no Golden Era tokens', file => {
    const hits = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
      .map((line, i) => (GOLDEN_ERA.test(line) ? `${file}:${i + 1}: ${line.trim()}` : null))
      .filter(Boolean);
    expect(hits).toEqual([]);
  });

  it('no screen or component passes or declares a seaGlass prop', () => {
    const hits = ['app', 'components'].flatMap(d => sourceFiles(path.join(ROOT, d)))
      .filter(f => /\bseaGlass\b/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});

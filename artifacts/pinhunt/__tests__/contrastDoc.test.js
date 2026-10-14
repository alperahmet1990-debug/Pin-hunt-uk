// docs/design/colour-contrast.md lists every pair in constants/contrastPairs.ts (UX-049, #158).
// Plain JS: reads source files, and the app tsconfig has no Node types.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const doc = readFileSync(path.resolve(__dirname, '../../../docs/design/colour-contrast.md'), 'utf8');
const src = readFileSync(path.resolve(__dirname, '../constants/contrastPairs.ts'), 'utf8');
const tableIds = [...src.slice(0, src.indexOf('KNOWN_CONTRAST_GAPS')).matchAll(/\{ id: '([a-z-]+)'/g)].map(m => m[1]);
const docIds = [...doc.matchAll(/^\| `([a-z-]+)` \|/gm)].map(m => m[1]);

it('the design doc and the code table list the same pairs', () => {
  expect(tableIds.length).toBeGreaterThan(15);
  expect(docIds.sort()).toEqual([...tableIds].sort());
});

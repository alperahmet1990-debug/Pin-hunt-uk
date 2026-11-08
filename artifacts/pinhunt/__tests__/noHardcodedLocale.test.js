// HM-03 (#563): dates and money go through utils/format.ts, so they follow
// the collector's home market. This fails if a hard-coded locale comes back.
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('no hard-coded locales', () => {
  const files = ['app', 'components', 'hooks', 'utils', 'lib', 'context'].flatMap(d => sourceFiles(path.join(ROOT, d)));

  it('only utils/format.ts names en-GB or en-US', () => {
    const hits = files
      .filter(f => path.relative(ROOT, f) !== path.join('utils', 'format.ts'))
      .filter(f => /['"]en-(GB|US)['"]/.test(readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});

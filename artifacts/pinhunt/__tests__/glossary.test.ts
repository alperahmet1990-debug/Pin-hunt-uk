import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Retired user-facing labels from the collecting glossary (docs/design/glossary.md, #108).
// Patterns match string literals and JSX text, not code comments.
const RETIRED: Array<[string, RegExp]> = [
  ['"Trade" as a filter or post-type label (use "For Trade")', /label:\s*'Trade'/],
  ['"Traders" as a tab label (use "For Trade")', /label:\s*'Traders'/],
  ['"On Your ISO" (use "On your ISO")', /['"`>]\s*On Your ISO/],
  ['"In your ISO" (use "On your ISO")', /['"`>]\s*In your ISO/],
  ['"In Collection" (use "Owned" / "You own N")', /['"`>]\s*In Collection\b/],
  ['"For trade" as a badge label (use "For Trade")', /label:\s*'For trade'/],
];

const ROOT = path.resolve(__dirname, '..');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('collecting glossary', () => {
  const files = ['app', 'components'].flatMap(d => sourceFiles(path.join(ROOT, d)));

  it('scans the app source', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(RETIRED)('no %s', (_what, pattern) => {
    const hits = files.filter(f => pattern.test(readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});

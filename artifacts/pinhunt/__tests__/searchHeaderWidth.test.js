// The Search box must be able to shrink below the web <input>'s ~20-character
// default width, or the page overflows a 320 pt screen (UX-053, #196).
// Plain JS: reads source files, and the app tsconfig has no Node types.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const src = readFileSync(path.resolve(__dirname, '..', 'app/search.tsx'), 'utf8');
const style = (name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('Search header width', () => {
  it.each(['inputWrap', 'input'])('%s can shrink (minWidth: 0)', (name) => {
    expect(style(name)).toMatch(/\bflex: 1\b/);
    expect(style(name)).toMatch(/\bminWidth: 0\b/);
  });
});

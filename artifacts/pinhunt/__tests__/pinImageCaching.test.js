// Catalogue pin images go through the cached PinImage (B-P1-14a, #39), never a
// bare react-native <Image>, so they download once per device.
// Plain JS: reads source files, and the app tsconfig has no Node types.
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// Anything that renders a catalogue pin's photo or its placeholder.
const PIN_SOURCE = /getPinImageSource\(|pinImageSource\(|PLACEHOLDER_IMAGE|(?:pin|linkedPin|row|opportunity|firstPin|secondPin|representative)\??\.imageUrl/;

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' || name === 'admin' ? [] : files(full);
    return /\.tsx$/.test(name) ? [full] : [];
  });
}

/** Each bare <Image …/> tag in a file, with its line number. */
function imageTags(src) {
  const tags = [];
  const re = /<Image\b[\s\S]*?\/>/g;
  let m;
  while ((m = re.exec(src))) tags.push({ tag: m[0], line: src.slice(0, m.index).split('\n').length });
  return tags;
}

describe('pin image caching', () => {
  const sources = [...files(path.join(ROOT, 'app')), ...files(path.join(ROOT, 'components'))];

  it('finds the screens it guards', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('never renders pin imagery with an uncached <Image>', () => {
    const offenders = sources.flatMap(f => imageTags(readFileSync(f, 'utf8'))
      .filter(t => PIN_SOURCE.test(t.tag))
      .map(t => `${path.relative(ROOT, f)}:${t.line}`));
    expect(offenders).toEqual([]);
  });

  it('PinImage itself sets the disk cache', () => {
    expect(readFileSync(path.join(ROOT, 'components/ui/PinImage.tsx'), 'utf8')).toMatch(/cachePolicy="memory-disk"/);
  });
});

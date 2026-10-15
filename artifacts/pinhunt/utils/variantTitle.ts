/**
 * Set detail tiles (B-P1-17, #43): a pin titled "<set> - Buzz Lightyear" shows
 * "Buzz Lightyear", because the set is already the screen's title and every
 * tile otherwise reads the same truncated set name. Only a leading set name
 * followed by a separator is removed; anything else stays as it is, and a
 * title that would end up empty is left whole.
 */
const SEPARATOR = /^\s*(?:[-–—:|•·,]|\/)\s*/;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function variantTitle(title: string, setName: string | undefined): string {
  const set = norm(setName ?? '');
  if (!set) return title;
  const t = title.trimStart();
  // Compare case- and whitespace-insensitively, then cut the same span of the original.
  let i = 0;
  let matched = 0;
  while (i < t.length && matched < set.length) {
    const c = t[i].toLowerCase();
    if (/\s/.test(c)) {
      if (set[matched] === ' ') matched++;
      while (i < t.length && /\s/.test(t[i])) i++;
      continue;
    }
    if (c !== set[matched]) return title;
    i++;
    matched++;
  }
  if (matched < set.length) return title;
  const rest = t.slice(i);
  const sep = rest.match(SEPARATOR);
  if (!sep) return title;
  const variant = rest.slice(sep[0].length).trim();
  return variant || title;
}

/**
 * Pin identity check, shared by every importer that matches rows by pinhunt_id
 * (routes/catalogue-import.ts and scripts/import-trusted-catalogue.mjs).
 *
 * A pinhunt_id is permanent: an import may refine the pin it names, but must
 * never turn it into a different pin. This decides whether an incoming row
 * still describes the existing pin. When it doesn't, the importer rejects the
 * row instead of overwriting.
 */

const STOP = new Set([
  "the", "and", "of", "a", "an", "in", "on", "with", "pin", "pins", "le", "limited", "edition", "release",
  "mystery", "series", "collection", "set", "disney", "parks", "park", "store", "box", "blind", "pack",
  "open", "trading", "wdw", "dlr", "dlp", "walt", "world", "resort",
]);
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const PLACEHOLDER_TITLE = new RegExp(`^(${MONTHS})\\s+\\d{4}\\s*[–—-]`, "i");
const PLACEHOLDER_CHARS = new Set(["", "unknown", "various", "tbc", "tba", "n/a"]);

const MAX_WORD = 40;        // longer "words" are noise, not names
const MAX_TEXT = 500;       // titles/sets/characters are short; cap pathological cells

/** @param {unknown} s */
export function tokens(s) {
  return new Set(
    String(s ?? "").slice(0, MAX_TEXT)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t) && !/^(19|20)\d\d$/.test(t)),
  );
}

/** @param {unknown} s */
const normName = (s) => [...tokens(s)].sort().join(" ");

/** Set-name words, keeping years (2024 ≠ 2025 is a different set). @param {unknown} s */
function setTokens(s) {
  const out = new Set(tokens(s));
  for (const y of String(s ?? "").match(/\b(19|20)\d\d\b/g) ?? []) out.add(y);
  return out;
}

/** One word set per character name ("Winnie the Pooh" → {winnie, pooh}), ignoring placeholders. @param {unknown} list */
function characterNames(list) {
  const arr = Array.isArray(list) ? list : String(list ?? "").split(/[;,]/);
  const names = [];
  for (const c of arr) {
    const name = normName(c);
    if (name && !PLACEHOLDER_CHARS.has(name)) names.push(new Set(name.split(" ")));
  }
  return names;
}

/** Two names are the same character when all words of one appear in the other ("Pooh" ⊂ "Winnie the Pooh"),
 *  so a shared surname alone ("Mickey Mouse" / "Minnie Mouse", "Donald Duck" / "Daisy Duck") is not enough. */
const sameCharacter = (a, b) => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  return sharedWords(small, big) === small.size;
};
const anySameCharacter = (as, bs) => as.some((a) => bs.some((b) => sameCharacter(a, b)));

/** Edit distance between two words. */
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Same word, allowing only a likely typo: a missing/extra letter in words of
 * 5+ letters ("Stich"/"Stitch", "Cinderela"/"Cinderella"), or up to two edits
 * in words of 8+ letters. Swapped letters in short words are different words
 * ("Lilo"/"Milo", "Pluto"/"Plato", "Goofy"/"Goody").
 */
export function sameWord(a, b) {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  // Cheap exits before the O(n·m) distance: too short to be a typo, too different in length, or not a real word.
  if (min < 5 || Math.abs(a.length - b.length) > 2 || Math.max(a.length, b.length) > MAX_WORD) return false;
  const d = editDistance(a, b);
  if (min >= 8) return d <= 2;
  return min >= 5 && d === 1 && a.length !== b.length;
}

/** Words of `a` that have an equal-or-typo match in `b`. */
const sharedWords = (a, b) => [...a].filter((x) => [...b].some((y) => sameWord(x, y))).length;
/** Every word of the smaller set appears (or is a typo) in the larger. */
const containedIn = (a, b) => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  return sharedWords(small, big) === small.size;
};

/**
 * @param {{ title?: string|null, collection?: string|null, characters?: string[]|string|null }} existing
 * @returns {boolean}
 */
export function isPlaceholder(existing) {
  if (PLACEHOLDER_TITLE.test(String(existing.title ?? "").trim())) return true;
  return characterNames(existing.characters).length === 0 && /\b(unknown|various)\b/i.test(String(existing.characters ?? ""));
}

/**
 * Does `incoming` still describe the same pin as `existing`?
 * @param {{ title?: string|null, collection?: string|null, characters?: string[]|string|null }} existing
 * @param {{ title?: string|null, collection?: string|null, characters?: string[]|string|null }} incoming
 * @returns {{ ok: boolean, basis: string }}
 */
export function checkPinIdentity(existing, incoming) {
  // Set: the shorter set name must be contained in the longer one, years included
  // ("Animated Cuties Mystery Collection 2026" ⊇ "Animated Cuties"), so
  // "Halloween 2024" ≠ "Halloween 2025" and "Valentines Day" ≠ "St Patricks Day".
  const collA = setTokens(existing.collection);
  const collB = setTokens(incoming.collection);
  const sameCollection = collA.size === 0 || collB.size === 0 || containedIn(collA, collB);

  // Characters: when both rows name characters, they must name the same character.
  const cA = characterNames(existing.characters);
  const cB = characterNames(incoming.characters);
  if (cA.length && cB.length && !anySameCharacter(cA, cB)) return { ok: false, basis: "different character" };

  if (!sameCollection) {
    // A month placeholder may only resolve inside its own set; anything else moving set is a different pin.
    return { ok: false, basis: "different set" };
  }

  // Title: drop only the set words BOTH rows share and the character names, then the
  // remaining words may be added or misspelt but never swapped
  // ("Haunted Mansion" ⊂ "Haunted Mansion – Windows of Attraction", "Cinderela" ≈ "Cinderella",
  //  but "Stitch Surf" ≠ "Stitch Ski" and "Mickey Ice Cream" ≠ "Mickey Pumpkin").
  const sharedSet = [...collA].filter((x) => [...collB].some((y) => sameWord(x, y)));
  // Character names are only "known words" when both rows name that same character;
  // if one row has no characters, a character word in the title is what identifies the pin.
  // Only characters that appear on BOTH rows are stripped ("Mickey & Minnie Kiss" vs
  // "Mickey & Pluto Kiss" keeps Minnie/Pluto, so the swap is refused).
  const charWords = [...cA.filter((a) => cB.some((b) => sameCharacter(a, b))),
                     ...cB.filter((b) => cA.some((a) => sameCharacter(a, b)))].flatMap((n) => [...n]);
  const known = [...sharedSet, ...charWords];
  const strip = (title) => new Set([...tokens(title)].filter((x) => !known.some((k) => sameWord(x, k))));
  const tA = strip(existing.title);
  const tB = strip(incoming.title);
  const titleCompatible = tA.size === 0 || tB.size === 0 || containedIn(tA, tB);

  if (normName(existing.title) && normName(existing.title) === normName(incoming.title)) return { ok: true, basis: "same title in the same set" };
  if (titleCompatible && (tA.size || tB.size || (cA.length && cB.length))) return { ok: true, basis: "same pin, refined or corrected" };
  if (isPlaceholder(existing)) return { ok: true, basis: "placeholder resolved within its set" };
  return { ok: false, basis: "different pin" };
}

/** Error text shown to App Creators when a row is refused. */
export function identityConflictMessage(pinhuntId, existingTitle) {
  return `${pinhuntId} already belongs to a different pin ("${existingTitle}"). This row was not imported. `
    + "If it is a correction to that same pin, edit it in Admin → Catalogue (changes there are one pin at a time). "
    + "If it is a different pin, give it its own new pinhunt_id.";
}

/**
 * Guard for importers that resolve a target row first and then update it
 * (scripts/import-trusted-catalogue.mjs). Only matches made BY pinhunt_id are
 * checked: external-id and normalised-name matches are identity matches already.
 * @returns {null | { pinhunt_id: string, existing_title: string, incoming_title: string, message: string }}
 */
export function guardIdMatch({ target, matchedBy, pinhuntId, incoming }) {
  if (!target || matchedBy !== "pinhunt_id") return null;
  const check = checkPinIdentity(
    { title: target.title, collection: target.collection, characters: target.all_characters ?? target.main_character },
    incoming,
  );
  if (check.ok) return null;
  return {
    pinhunt_id: pinhuntId,
    existing_title: String(target.title ?? ""),
    incoming_title: String(incoming.title ?? ""),
    message: identityConflictMessage(pinhuntId, String(target.title ?? "")),
  };
}

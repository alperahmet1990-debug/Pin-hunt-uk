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

/** @param {unknown} s */
export function tokens(s) {
  return new Set(
    String(s ?? "")
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
  const d = editDistance(a, b);
  if (min >= 8) return d <= 2;
  return min >= 5 && d === 1 && a.length !== b.length;
}

/** Words of `a` that have an equal-or-typo match in `b`. */
const sharedWords = (a, b) => [...a].filter((x) => [...b].some((y) => sameWord(x, y))).length;

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
  const collA = tokens(existing.collection);
  const collB = tokens(incoming.collection);
  const sameCollection = collA.size === 0 || collB.size === 0 || sharedWords(collA, collB) > 0;

  // When both rows name characters, they must name the same character: a shared
  // title or set ("Ice Cream Bar Mickey" / "Ice Cream Bar Minnie") is not enough.
  const cA = characterNames(existing.characters);
  const cB = characterNames(incoming.characters);
  if (cA.length && cB.length) {
    if (!anySameCharacter(cA, cB)) return { ok: false, basis: "different character" };
    if (sameCollection) return { ok: true, basis: "same character in the same set" };
  }

  // Compare titles without the set words both rows share ("Ice Cream Bar Minnie" vs "Ice Cream Bar Stitch").
  const strip = (t) => new Set([...tokens(t)].filter((x) => !collA.has(x) && !collB.has(x)));
  const tA = strip(existing.title);
  const tB = strip(incoming.title);
  if (normName(existing.title) && normName(existing.title) === normName(incoming.title)) return { ok: true, basis: "same title" };
  // Words may be added or misspelt, never swapped: every word of the shorter title must
  // appear in the longer one ("Haunted Mansion" ⊂ "Haunted Mansion – Windows of Attraction",
  // "Cinderela Castle" ≈ "Cinderella Castle"), but "Mickey Ice Cream Bar" ≠ "Minnie Ice Cream Bar".
  if (tA.size && tB.size) {
    const [small, big] = tA.size <= tB.size ? [tA, tB] : [tB, tA];
    if (sharedWords(small, big) === small.size) return { ok: true, basis: "same title words (spelling-tolerant)" };
  }

  if (isPlaceholder(existing) && sameCollection) return { ok: true, basis: "placeholder resolved within its set" };

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

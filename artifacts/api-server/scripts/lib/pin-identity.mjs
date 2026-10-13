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

/** @param {unknown} list */
function characterSet(list) {
  const arr = Array.isArray(list) ? list : String(list ?? "").split(/[;,]/);
  return new Set(arr.map((c) => normName(c)).filter((c) => c && !PLACEHOLDER_CHARS.has(c)));
}

const overlaps = (a, b) => [...a].some((x) => b.has(x));

/**
 * @param {{ title?: string|null, collection?: string|null, characters?: string[]|string|null }} existing
 * @returns {boolean}
 */
export function isPlaceholder(existing) {
  if (PLACEHOLDER_TITLE.test(String(existing.title ?? "").trim())) return true;
  return characterSet(existing.characters).size === 0 && /\b(unknown|various)\b/i.test(String(existing.characters ?? ""));
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
  const sameCollection = collA.size === 0 || collB.size === 0 || overlaps(collA, collB);

  // Compare titles without the set words both rows share ("Ice Cream Bar Minnie" vs "Ice Cream Bar Stitch").
  const strip = (t) => new Set([...tokens(t)].filter((x) => !collA.has(x) && !collB.has(x)));
  const tA = strip(existing.title);
  const tB = strip(incoming.title);
  if (normName(existing.title) && normName(existing.title) === normName(incoming.title)) return { ok: true, basis: "same title" };
  if (tA.size && tB.size) {
    const shared = [...tA].filter((x) => tB.has(x)).length;
    if (shared >= 1 && shared / Math.min(tA.size, tB.size) >= 0.6) return { ok: true, basis: "same title words" };
  }

  const cA = characterSet(existing.characters);
  const cB = characterSet(incoming.characters);
  if (cA.size && cB.size && overlaps(cA, cB) && sameCollection) return { ok: true, basis: "same character in the same set" };

  if (isPlaceholder(existing) && sameCollection) return { ok: true, basis: "placeholder resolved within its set" };

  return { ok: false, basis: "different pin" };
}

/** Error text shown to App Creators when a row is refused. */
export function identityConflictMessage(pinhuntId, existingTitle) {
  return `${pinhuntId} already belongs to a different pin ("${existingTitle}"). `
    + "This row was not imported. Leave pinhunt_id blank to add it as a new pin, or fix the ID.";
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

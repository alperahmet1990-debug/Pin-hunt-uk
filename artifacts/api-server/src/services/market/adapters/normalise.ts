/**
 * Pure helpers that turn loosely typed provider fields into the bounded
 * values `NormalisedListing` and migration 049 expect. No I/O.
 */
import type { Market } from "../adapter";

export type RawRow = Record<string, unknown>;

export const isRawRow = (v: unknown): v is RawRow => typeof v === "object" && v !== null && !Array.isArray(v);

/** First field among `keys` that is present and not null/empty. */
export function pick(row: RawRow, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/** numeric(10,2) upper bound in 049. */
const MAX_AMOUNT = 99_999_999.99;

/**
 * Parse a decimal amount written in English ("1,234.50") or French
 * ("1 234,50", "1.234,50", "12,5") style. Returns null when the format is
 * ambiguous or not a non-negative number, so a guessed price never enters
 * the evidence.
 */
export function parseDecimal(raw: string, lang: "en" | "fr" = "en"): number | null {
  const s = raw.replace(/[\s  ']/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let canonical: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the later one is the decimal separator.
    const dec = lastComma > lastDot ? "," : ".";
    const thousands = dec === "," ? "." : ",";
    const [intPart, decPart, ...rest] = s.split(dec);
    if (rest.length || decPart === undefined || !/^\d{1,2}$/.test(decPart)) return null;
    if (!isThousandsGrouped(intPart, thousands)) return null;
    canonical = `${intPart.split(thousands).join("")}.${decPart}`;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length === 2 && /^\d{1,2}$/.test(tail)) {
      canonical = `${parts[0]}.${tail}`; // decimal
    } else if (isThousandsGrouped(s, sep)) {
      // "1,234" / "1.234": thousands in the style that uses that separator for
      // thousands (en uses ",", fr uses "."), ambiguous otherwise.
      if (parts.length === 2 && ((sep === "," && lang === "fr") || (sep === "." && lang === "en"))) return null;
      canonical = parts.join("");
    } else {
      return null;
    }
  } else {
    canonical = s;
  }
  const n = Number(canonical);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

function isThousandsGrouped(s: string, sep: string): boolean {
  const groups = s.split(sep);
  return /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every(g => /^\d{3}$/.test(g));
}

const CURRENCY_HINTS: Array<[RegExp, string]> = [
  [/£|\bGBP\b/i, "GBP"],
  [/€|\bEUR\b/i, "EUR"],
  [/\bC\s?\$|\bCA\$|\bCAD\b/i, "CAD"],
  [/\bAU\s?\$|\bAUD\b/i, "AUD"],
  [/\bUS\s?\$|\bUSD\b|\$/i, "USD"],
];

/** ISO code from a code ("gbp") or symbol text ("£", "US $"); null when unknown. */
export function currencyCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(t)) return t;
  for (const [re, code] of CURRENCY_HINTS) if (re.test(v)) return code;
  return null;
}

export interface Money {
  amount: number | null;
  /** Currency stated by the value itself, when it states one. */
  currency: string | null;
}

/**
 * Parse a price field: a number, a string with or without a symbol
 * ("£12.50", "12,50 €", "US $9.99"), or an object such as
 * `{ value | amount, currency | currency_code }`.
 */
export function parseMoney(raw: unknown, lang: "en" | "fr" = "en"): Money {
  if (raw === undefined || raw === null || raw === "") return { amount: null, currency: null };
  if (typeof raw === "number") {
    return {
      amount: Number.isFinite(raw) && raw >= 0 && raw <= MAX_AMOUNT ? Math.round(raw * 100) / 100 : null,
      currency: null,
    };
  }
  if (typeof raw === "string") {
    const currency = currencyCode(raw.replace(/[\d\s.,  '-]/g, "")) ?? currencyCode(raw);
    const numeric = raw.replace(/[^\d.,\s  '-]/g, "").trim();
    if (numeric.includes("-")) return { amount: null, currency };
    return { amount: numeric ? parseDecimal(numeric, lang) : null, currency };
  }
  if (isRawRow(raw)) {
    const inner = parseMoney(pick(raw, "value", "amount", "price"), lang);
    return {
      amount: inner.amount,
      currency: currencyCode(pick(raw, "currency", "currency_code", "currencyCode")) ?? inner.currency,
    };
  }
  return { amount: null, currency: null };
}

/** Lenient boolean: true/false, "true"/"false", "yes"/"no", 1/0. Null otherwise. */
export function parseBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw === 1 || raw === "1") return true;
  if (raw === 0 || raw === "0") return false;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "true" || t === "yes") return true;
    if (t === "false" || t === "no") return false;
  }
  return null;
}

/** Non-negative integer count, or null. */
export function parseCount(raw: unknown): number | null {
  const n = typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null;
}

const MIN_DATE = Date.UTC(1990, 0, 1);
const FUTURE_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Parse a sale date to an ISO string. Accepts ISO 8601, epoch seconds or
 * milliseconds, and slash dates (DD/MM/YYYY for UK and FR, MM/DD/YYYY for
 * US). Dates before 1990 or more than two days ahead of `now` are rejected.
 */
export function parseDate(raw: unknown, market: Market, now: number): string | null {
  let ms: number | null = null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    ms = raw < 1e11 ? raw * 1000 : raw;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (slash) {
      const [a, b, y] = [Number(slash[1]), Number(slash[2]), Number(slash[3])];
      const [day, month] = market === "US" ? [b, a] : [a, b];
      const d = new Date(Date.UTC(y, month - 1, day));
      ms = d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.getTime() : null;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
      const p = Date.parse(t);
      ms = Number.isNaN(p) ? null : p;
    } else if (/^\d{9,13}$/.test(t)) {
      return parseDate(Number(t), market, now);
    }
  }
  if (ms === null || ms < MIN_DATE || ms > now + FUTURE_TOLERANCE_MS) return null;
  return new Date(ms).toISOString();
}

/** English and French month names and abbreviations (accents removed), 1-based. */
const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, janv: 1, janvier: 1,
  feb: 2, february: 2, fev: 2, fevr: 2, fevrier: 2,
  mar: 3, march: 3, mars: 3,
  apr: 4, april: 4, avr: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, july: 7, juil: 7, juillet: 7,
  aug: 8, august: 8, aou: 8, aout: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
};

/**
 * Parse the human sold-date text eBay shows ("Sold 21 Nov 2026",
 * "Sold Nov 21, 2026", "Vendu le 21 nov. 2026", and "14-Sept 18:22", the
 * form Soldgraph sent on 24 Nov 2026), for rows where the
 * structured date is missing. A text without a year ("Sold 21 Nov") takes
 * the most recent such date that isn't in the future. Anything else, or an
 * impossible date, is null. Same range checks as `parseDate`.
 */
export function parseSoldDateText(raw: unknown, market: Market, now: number): string | null {
  if (typeof raw !== "string" || raw.length > 100) return null;
  const t = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/^\s*(sold|ended|vendu|vendue|termine|terminee)\b(\s+(on|le))?/, "")
    .replace(/\s+/g, " ")
    .trim()
    // A trailing time is ignored: "14-sept 18:22", "nov 21 2026 9:05 pm".
    .replace(/ ?\d{1,2}:\d{2}( ?[ap]m)?$/, "")
    // Dashed day-month(-year): "14-sept", "14-sept-26".
    .replace(/^(\d{1,2})-([a-z]+)(?:-(\d{2}|\d{4}))?$/, (_m, d, mo, y) => [d, mo, y].filter(Boolean).join(" "));
  if (!t) return null;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t) || /^\d{4}-\d{2}-\d{2}/.test(t)) return parseDate(t, market, now);

  let day: number, month: number | undefined, year: number | null;
  const dmy = /^(\d{1,2}) ([a-z]+)(?: (\d{4}|\d{2}))?$/.exec(t);
  const mdy = /^([a-z]+) (\d{1,2})(?: (\d{4}))?$/.exec(t);
  if (dmy) {
    const y = dmy[3] ? Number(dmy[3]) : null;
    [day, month, year] = [Number(dmy[1]), MONTHS[dmy[2]], y !== null && y < 100 ? 2000 + y : y];
  } else if (mdy) {
    [day, month, year] = [Number(mdy[2]), MONTHS[mdy[1]], mdy[3] ? Number(mdy[3]) : null];
  } else {
    return null;
  }
  if (!month) return null;

  const build = (y: number): number | null => {
    const d = new Date(Date.UTC(y, month - 1, day));
    return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.getTime() : null;
  };
  let ms: number | null;
  if (year !== null) {
    ms = build(year);
  } else {
    const thisYear = new Date(now).getUTCFullYear();
    ms = build(thisYear);
    if (ms !== null && ms > now + FUTURE_TOLERANCE_MS) ms = build(thisYear - 1);
  }
  if (ms === null || ms < MIN_DATE || ms > now + FUTURE_TOLERANCE_MS) return null;
  return new Date(ms).toISOString();
}

/** Collapse whitespace, strip control characters, cap the length. Null when empty. */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  // eslint-disable-next-line no-control-regex
  const t = String(raw).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/** Marketplace item id: 1–200 printable characters, no whitespace. */
export function cleanExternalId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const t = String(raw).trim();
  return /^[\x21-\x7e]{1,200}$/.test(t) ? t : null;
}

/**
 * Keep a listing link only when it is https on one of `hosts` (or a
 * subdomain). Credentials, query string and fragment are removed, so
 * tracking or referral parameters never reach storage. Null otherwise.
 */
export function safeListingUrl(raw: unknown, hosts: readonly string[]): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (!hosts.some(h => host === h || host.endsWith(`.${h}`))) return null;
  u.username = "";
  u.password = "";
  u.search = "";
  u.hash = "";
  const out = u.toString();
  return out.length <= 2000 ? out : null;
}

/**
 * Price, shipping and stated currency of a row, checked against the source
 * currency. Returns "currency_mismatch" when the row states another currency.
 * Shipping in another currency is dropped to null rather than mixed in.
 */
export function rowPrices(
  row: RawRow,
  ctx: { currency: string; lang: "en" | "fr" },
  priceKeys: string[],
  shippingKeys: string[] = ["shipping", "shipping_price", "shipping_cost", "postage", "displayed_shipping"],
): { price: number | null; shipping: number | null } | "currency_mismatch" {
  const price = parseMoney(pick(row, ...priceKeys), ctx.lang);
  const stated = price.currency ?? currencyCode(pick(row, "currency", "currency_code"));
  if (stated && stated !== ctx.currency) return "currency_mismatch";
  const ship = parseMoney(pick(row, ...shippingKeys), ctx.lang);
  return { price: price.amount, shipping: ship.currency && ship.currency !== ctx.currency ? null : ship.amount };
}

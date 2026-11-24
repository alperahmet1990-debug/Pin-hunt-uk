import { describe, expect, it } from "vitest";
import { cleanExternalId, cleanText, parseBool, parseCount, parseDate, parseDecimal, parseMoney, parseSoldDateText, safeListingUrl } from "./normalise";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

describe("parseDecimal", () => {
  it.each([
    ["12.50", "en", 12.5],
    ["12,50", "fr", 12.5],
    ["12,5", "en", 12.5],
    ["1 234,56", "fr", 1234.56],
    ["1 234,56", "fr", 1234.56],
    ["1.234,56", "fr", 1234.56],
    ["1,234.56", "en", 1234.56],
    ["1,234", "en", 1234],
    ["1.234", "fr", 1234],
    ["1,234,567", "en", 1234567],
    ["7", "en", 7],
    ["0.999", "en", null], // three decimals with a dot in English is ambiguous
    ["1,234", "fr", null], // ambiguous in French
    ["1.234", "en", null], // ambiguous in English
    ["12,3,4", "en", null],
    ["abc", "en", null],
    ["100000000", "en", null], // above numeric(10,2)
  ] as const)("%j (%s) -> %s", (raw, lang, expected) => {
    expect(parseDecimal(raw, lang)).toBe(expected);
  });
});

describe("parseMoney", () => {
  it.each([
    [12.345, { amount: 12.35, currency: null }],
    [-1, { amount: null, currency: null }],
    [Number.NaN, { amount: null, currency: null }],
    [null, { amount: null, currency: null }],
    ["£24.99", { amount: 24.99, currency: "GBP" }],
    ["12,50 €", { amount: 12.5, currency: "EUR" }],
    ["US $9.99", { amount: 9.99, currency: "USD" }],
    ["$9.99", { amount: 9.99, currency: "USD" }],
    ["C $60.00", { amount: 60, currency: "CAD" }],
    ["9.99 GBP", { amount: 9.99, currency: "GBP" }],
    ["-5 €", { amount: null, currency: "EUR" }],
    [{ value: "8,9", currency: "eur" }, { amount: 8.9, currency: "EUR" }],
    [{ amount: 35, currency_code: "USD" }, { amount: 35, currency: "USD" }],
    [{ value: null }, { amount: null, currency: null }],
    [true, { amount: null, currency: null }],
  ] as const)("%j", (raw, expected) => {
    expect(parseMoney(raw, "en")).toEqual(expected);
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-10-01T14:30:00Z", "UK", "2026-10-01T14:30:00.000Z"],
    ["2026-09-28", "UK", "2026-09-28T00:00:00.000Z"],
    ["14/09/2026", "FR", "2026-09-14T00:00:00.000Z"],
    ["09/14/2026", "US", "2026-09-14T00:00:00.000Z"],
    ["14/09/2026", "US", null],
    ["31/02/2026", "UK", null],
    [1790000000, "US", "2026-09-21T14:13:20.000Z"],
    [1790000000000, "US", "2026-09-21T14:13:20.000Z"],
    ["1790000000", "US", "2026-09-21T14:13:20.000Z"],
    ["1980-01-01", "UK", null],
    ["2027-01-01", "UK", null],
    ["yesterday", "UK", null],
    [undefined, "UK", null],
  ] as const)("%j (%s) -> %s", (raw, market, expected) => {
    expect(parseDate(raw, market, NOW)).toBe(expected);
  });
});

describe("parseSoldDateText", () => {
  // NOW is 18 Oct 2026, 12:00 UTC.
  it.each([
    ["Sold 1 Oct 2026", "UK", "2026-10-01T00:00:00.000Z"],
    ["Sold  21 November 2025", "UK", "2025-11-21T00:00:00.000Z"],
    ["sold 5 sept 2026", "UK", "2026-09-05T00:00:00.000Z"],
    ["Sold Oct 1, 2026", "US", "2026-10-01T00:00:00.000Z"],
    ["Sold on Sep 30, 2026", "US", "2026-09-30T00:00:00.000Z"],
    ["Vendu le 14 sept. 2026", "FR", "2026-09-14T00:00:00.000Z"],
    ["Vendu le 3 août 2026", "FR", "2026-08-03T00:00:00.000Z"],
    ["Vendu le 2 févr. 2026", "FR", "2026-02-02T00:00:00.000Z"],
    ["Sold 14/09/2026", "UK", "2026-09-14T00:00:00.000Z"],
    // The form Soldgraph sent on the 24 Nov 2026 staging probe: "99-sept 99:99".
    ["14-Sept 18:22", "UK", "2026-09-14T00:00:00.000Z"],
    ["3-Oct 09:05", "UK", "2026-10-03T00:00:00.000Z"],
    ["21-Nov 18:22", "UK", "2025-11-21T00:00:00.000Z"],
    ["14-Sept-26 18:22", "UK", "2026-09-14T00:00:00.000Z"],
    ["Sold Sep 30, 2026 9:05 pm", "US", "2026-09-30T00:00:00.000Z"],
    ["31-Sept 18:22", "UK", null],
    // No year: the most recent such date that isn't in the future.
    ["Sold 1 Oct", "UK", "2026-10-01T00:00:00.000Z"],
    ["Sold 21 Nov", "UK", "2025-11-21T00:00:00.000Z"],
    ["Sold 31 Feb 2026", "UK", null],
    ["Sold 1 Smarch 2026", "UK", null],
    ["Sold 21 Nov 2026", "UK", null],
    ["Sold 1 Jan 1985", "UK", null],
    ["Sold recently", "UK", null],
    ["", "UK", null],
    [null, "UK", null],
    [20261001, "UK", null],
  ] as const)("%j (%s) -> %s", (raw, market, expected) => {
    expect(parseSoldDateText(raw, market, NOW)).toBe(expected);
  });
});

describe("safeListingUrl", () => {
  const hosts = ["ebay.co.uk", "ebay.com"];
  it.each([
    ["https://www.ebay.co.uk/itm/1?hash=x#y", "https://www.ebay.co.uk/itm/1"],
    ["https://user:pw@www.ebay.com/itm/2", "https://www.ebay.com/itm/2"],
    ["http://www.ebay.co.uk/itm/1", null],
    ["https://ebay.co.uk.evil.example/itm/1", null],
    ["https://notebay.com/itm/1", null],
    ["javascript:alert(1)", null],
    ["not a url", null],
    [42, null],
    [`https://www.ebay.com/${"a".repeat(2000)}`, null],
  ] as const)("%j -> %s", (raw, expected) => {
    expect(safeListingUrl(raw, hosts)).toBe(expected);
  });
});

describe("small field helpers", () => {
  it("cleanText collapses whitespace, strips control characters and caps length", () => {
    expect(cleanText("  a\n\tb\u0007c  ", 10)).toBe("a b c");
    expect(cleanText("x".repeat(600), 500)).toHaveLength(500);
    expect(cleanText("   ", 10)).toBeNull();
    expect(cleanText({}, 10)).toBeNull();
  });

  it("cleanExternalId accepts bounded printable ids only", () => {
    expect(cleanExternalId(4001)).toBe("4001");
    expect(cleanExternalId(" v1|1|0 ")).toBe("v1|1|0");
    expect(cleanExternalId("has space")).toBeNull();
    expect(cleanExternalId("x".repeat(201))).toBeNull();
    expect(cleanExternalId(null)).toBeNull();
  });

  it("parseBool and parseCount are strict", () => {
    expect([true, "false", "yes", 0, "1", "maybe", null].map(parseBool)).toEqual([true, false, true, false, true, null, null]);
    expect([3, "4", -1, 1.5, "x", null].map(parseCount)).toEqual([3, 4, null, null, null, null]);
  });
});

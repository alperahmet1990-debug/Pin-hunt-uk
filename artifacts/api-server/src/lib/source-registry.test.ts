import { describe, expect, it } from "vitest";
import { classifySource, countsAsEvidence, registrableDomain, storedSourceClass } from "./source-registry";

describe("registrableDomain", () => {
  it.each([
    ["static.wdwnt.com", "wdwnt.com"],
    ["www.wdwnt.com", "wdwnt.com"],
    ["wdwnt.com", "wdwnt.com"],
    ["www.disneystore.co.uk", "disneystore.co.uk"],
    ["pinpics.fandom.com", "fandom.com"],
  ])("%s → %s", (host, expected) => expect(registrableDomain(host)).toBe(expected));
});

describe("classifySource", () => {
  it.each([
    ["https://www.disneystore.co.uk/x", "official", "disneystore.co.uk"],
    ["https://disneyparksblog.com/y", "official", "disneyparksblog.com"],
    ["https://static.wdwnt.com/a", "news", "wdwnt.com"],
    ["https://www.laughingplace.com/a", "news", "laughingplace.com"],
    ["https://www.disneypinsblog.com/a", "fan", "disneypinsblog.com"],
    ["https://mousesteps.com/a", "fan", "mousesteps.com"],
    ["https://unknown-blog.example.org/a", "fan", "example.org"],
    ["https://www.reddit.com/r/x", "lead_only", "reddit.com"],
    ["https://disney-pins.fandom.com/wiki/x", "lead_only", "fandom.com"],
    ["https://www.pinandpop.com/p/1", "excluded", "pinandpop.com"],
    ["https://stewpins.com/p/1", "excluded", "stewpins.com"],
  ])("%s", (url, cls, domain) => expect(classifySource(url)).toEqual({ class: cls, domain }));

  it("returns null for an unparseable URL", () => expect(classifySource("not a url")).toBeNull());
  it("does not treat lookalike hosts as listed", () => {
    expect(classifySource("https://notwdwnt.com/a")?.class).toBe("fan");
    expect(classifySource("https://pinandpop.com.evil.example/a")?.class).toBe("fan");
  });
});

describe("marketplaces are lead-only", () => {
  const MARKETPLACES = [
    "ebay.co.uk", "ebay.com", "ebay.fr", "ebay.de", "ebay.it", "ebay.es", "ebay.com.au", "ebay.ca",
    "vinted.co.uk", "vinted.fr", "vinted.com", "vinted.de", "whatnot.com", "mercari.com", "depop.com",
    "etsy.com", "poshmark.com",
  ];
  it.each(MARKETPLACES)("%s and its subdomains", domain => {
    for (const host of [domain, `www.${domain}`, `m.${domain}`]) {
      expect(classifySource(`https://${host}/itm/1`)).toEqual({ class: "lead_only", domain });
    }
    const cls = classifySource(`https://www.${domain}/x`)!.class;
    expect(storedSourceClass(cls)).toBe("unclassified");
    expect(countsAsEvidence(cls)).toBe(false);
  });
  it.each([
    ["https://www.ebay.co.uk/itm/1"], ["https://m.ebay.com/itm/1"], ["https://www.vinted.fr/items/1"],
  ])("%s", url => expect(classifySource(url)?.class).toBe("lead_only"));
  it("does not treat lookalike marketplace hosts as listed", () => {
    expect(classifySource("https://notebay.com/a")?.class).toBe("fan");
    expect(classifySource("https://ebay.com.evil.example/a")?.class).toBe("fan");
  });
});

describe("stored class and counting", () => {
  it("stores lead_only as unclassified and does not count it", () => {
    expect(storedSourceClass("lead_only")).toBe("unclassified");
    expect(countsAsEvidence("lead_only")).toBe(false);
  });
  it("counts official, news and fan", () => {
    for (const c of ["official", "news", "fan"] as const) { expect(storedSourceClass(c)).toBe(c); expect(countsAsEvidence(c)).toBe(true); }
  });
});

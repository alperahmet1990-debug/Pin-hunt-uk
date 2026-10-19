/**
 * Marketplace leads (SG-10, #415): clustering, classification, the lead
 * threshold, privacy rules and the research-run output. Stored listings are
 * in-memory fixtures; nothing here reaches a database or a network.
 */
import { describe, expect, it } from "vitest";
import { validateResearchRun } from "../../../lib/research-run";
import { fixturePin } from "../__fixtures__/load";
import { NOW, SENTINEL_URL, fixtureListings, input, row } from "../__fixtures__/leads";
import { parseAttributes } from "../matching";
import {
  LEADS_ENGINE_VERSION,
  anchorDifference,
  buildLeads,
  confidenceFor,
  leadScore,
  type CandidateOut,
} from "./leads";

const DAY = 86_400_000;

const byReason = (cands: CandidateOut[], reason: string) => cands.filter(c => c.review_reasons.some(r => r.startsWith(reason)));

describe("anchorDifference", () => {
  const hatbox = fixturePin("hatbox");
  const check = (pin: ReturnType<typeof fixturePin>, title: string) => anchorDifference(pin, title, parseAttributes(title));

  it("is about the pin when only the edition size, year or variant differs", () => {
    expect(check(hatbox, "Disney Hatbox Ghost pin LE 3000 Haunted Mansion 50th Anniversary")).toEqual({ kind: "edition_size", attr: "3000" });
    expect(check(fixturePin("orangeBird"), "Orange Bird Sunshine pin 2019 Flower and Garden Festival")).toEqual({ kind: "release_year", attr: "2019" });
    expect(check(fixturePin("tink"), "Tinker Bell Pixie Dust Jumbo pin Peter Pan 70th Anniversary")).toEqual({ kind: "variant", attr: "jumbo" });
    expect(check(fixturePin("jumboSimba"), "Simba pin The Lion King 30th Anniversary LE 500 2024")).toEqual({ kind: "base_pin", attr: "jumbo" });
  });

  it("treats a different pin that shares the set and edition as not about the pin", () => {
    expect(check(hatbox, "Madame Leota pin Haunted Mansion 50th Anniversary 2021 LE 2000")).toBeNull();
  });

  it("reports an accepted listing as already catalogued", () => {
    expect(check(hatbox, "Disney Hatbox Ghost pin LE 2000 Haunted Mansion 50th Anniversary")).toBe("accepted");
  });
});

describe("buildLeads", () => {
  const result = buildLeads(input());
  const cands = result.run!.candidates;
  const pins = cands.filter(c => c.entity_type === "pin");

  it("passes the existing validateResearchRun", () => {
    const v = validateResearchRun(result.run);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.run.engineVersion).toBe(LEADS_ENGINE_VERSION);
      expect(v.run.counts.byConfidence.High).toBe(0);
      expect(v.run.counts.byConfidence.Medium).toBe(0);
    }
  });

  it("finds an LE size discrepancy and links it to the existing pin", () => {
    const [d] = byReason(pins, "discrepancy:edition_size");
    expect(d).toBeDefined();
    expect(d.duplicate_pinhunt_id).toBe("PHUK-TEST0001");
    expect(d.duplicate_status.startsWith("DUPLICATE")).toBe(true);
    expect(d.proposed["Edition size"]).toBe(3000);
    expect(d.proposed["Catalogue edition size"]).toBe(2000);
    expect(d.proposed["Listings"]).toBe(3);
    expect(d.research_key).toMatch(/^marketplace-leads\/discrepancy-edition-size\//);
  });

  it("finds a year discrepancy from 2 listings on 2 sites, one with a French title", () => {
    const [d] = byReason(pins, "discrepancy:release_year");
    expect(d.duplicate_pinhunt_id).toBe("PHUK-TEST0010");
    expect(d.proposed["Release year"]).toBe(2019);
    expect(d.proposed["Catalogue release year"]).toBe(2022);
    expect(d.proposed["Marketplaces"]).toBe("eBay FR, eBay UK");
  });

  it("finds a jumbo variant, clustering English and French titles", () => {
    const [v] = byReason(pins, "possible_variant_of:PHUK-TEST0003");
    expect(v.review_reasons).toContain("variant:jumbo");
    expect(v.proposed["Variant"]).toBe("jumbo");
    expect(v.proposed["Listings"]).toBe(3);
    expect(v.duplicate_pinhunt_id).toBeNull();
  });

  it("finds a missing set member and the set's gap", () => {
    const [m] = byReason(pins, "possible_set_member:Haunted Mansion 50th Anniversary");
    expect(m.review_reasons).toContain("possible_missing_pin");
    expect(m.review_reasons).toContain("set_gap:1/5");
    expect(m.proposed["Title words"]).toMatch(/madame leota/);
    expect(m.proposed["Edition size"]).toBe(2000);
    expect(m.duplicate_pinhunt_id).toBeNull();
  });

  it("proposes a set when two missing-pin leads share a series no known set has", () => {
    const sets = cands.filter(c => c.entity_type === "set");
    expect(sets).toHaveLength(1);
    expect(sets[0].proposed["Series (from listing titles)"]).toBe("villains masquerade");
    expect(sets[0].record_confidence).toBe("Unverified");
    const members = pins.filter(p => p.set_research_key === sets[0].research_key);
    expect(members.map(p => p.proposed["Characters"]).sort()).toEqual(["Maleficent", "Ursula"]);
  });

  it("never proposes a single listing, and ignores bundles and set listings", () => {
    expect(pins.some(p => p.review_reasons.includes("possible_variant_of:PHUK-TEST0002"))).toBe(false);
    expect(pins.some(p => p.duplicate_pinhunt_id === "PHUK-TEST0002")).toBe(false);
    expect(result.stats.belowThreshold.clusters).toBeGreaterThanOrEqual(1);
    expect(result.stats.ignored.bundle).toBe(2);
    expect(result.stats.ignored.set_listing).toBe(2);
    // The bundle/set rows said LE 3000 too, but the discrepancy still counts only the 3 single listings.
    expect(byReason(pins, "discrepancy:edition_size")[0].proposed["Listings"]).toBe(3);
  });

  it("never goes above Low confidence, and maps the score", () => {
    for (const c of cands) expect(["Low", "Unverified"]).toContain(c.record_confidence);
    expect(confidenceFor(100)).toBe("Low");
    expect(confidenceFor(59)).toBe("Unverified");
    for (const c of pins) expect(c.review_reasons.some(r => /^lead_score:\d{1,3}$/.test(r))).toBe(true);
  });

  it("keeps all evidence lead-only, with provenance and no source link", () => {
    for (const c of cands) {
      expect(c.evidence.length).toBeGreaterThan(0);
      for (const e of c.evidence) {
        expect(e.source_class).toBe("unclassified");
        expect(e.method).toBe("search_snippet");
        expect(e.source_url).toBeNull();
        expect(e.publisher).toMatch(/^Soldgraph: /);
        expect(e.note).toMatch(/^Lead only, not verification\. \d+ listing\(s\) on \d site\(s\); \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
        expect(e.note).toMatch(/lead score \d+\/100/);
        expect(e.note.length).toBeLessThanOrEqual(240);
        expect(e.claim_ref).toMatch(/^mkt-[0-9a-f]{12}$/);
        expect(JSON.stringify(e.value).length).toBeLessThanOrEqual(600);
      }
    }
    const [d] = byReason(pins, "discrepancy:release_year");
    expect(d.evidence[0].note).toMatch(/median EUR \d+\.\d{2}, GBP \d+\.\d{2}/);
  });

  it("puts no image, link, seller word or listing title anywhere in the file", () => {
    const text = JSON.stringify(result.run);
    expect(text).not.toMatch(/https?:|www\.|\.jpg|\.png|image|img|thumbnail|photo|seller/i);
    expect(text).not.toMatch(/SELLERWORD|sellerword|URL_SENTINEL|postage|neuf/i);
    for (const l of fixtureListings()) expect(text).not.toContain(l.title);
    expect(text).not.toContain(SENTINEL_URL);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildLeads(input()).run)).toBe(JSON.stringify(result.run));
  });

  it("drops listings outside the window and what the catalogue already has", () => {
    const old = buildLeads(input({ options: { windowDays: 5, minListings: 3, minMarketplaces: 2 } }));
    expect(old.run).toBeNull();
    expect(old.stats.ignored.outside_window).toBeGreaterThan(0);
    const known = buildLeads(input({
      listings: [
        row("hatbox", "Hatbox Ghost pin LE 2000 Haunted Mansion 50th Anniversary"),
        row("hatbox", "Disney Hatbox Ghost LE 2000 Haunted Mansion 50th Anniversary pin"),
        row("hatbox", "Hatbox Ghost Haunted Mansion 50th Anniversary pin LE 2000", { sourceId: "soldgraph:ebay_fr_sold" }),
      ],
    }));
    expect(known.run).toBeNull();
    expect(known.stats.alreadyCatalogued).toBe(3);
  });

  it("counts one marketplace item once, even when it was stored against two pins", () => {
    const twice = [
      row("hatbox", "Disney Hatbox Ghost pin LE 3000 Haunted Mansion 50th Anniversary", { externalId: "same", rejectionReason: "edition_size_conflict" }),
      row("steamboat", "Disney Hatbox Ghost pin LE 3000 Haunted Mansion 50th Anniversary", { externalId: "same", matchScore: 5 }),
      row("hatbox", "Hatbox Ghost LE 3000 pin Haunted Mansion 50th", { sourceId: "soldgraph:ebay_fr_sold", rejectionReason: "edition_size_conflict" }),
    ];
    const r = buildLeads(input({ listings: twice }));
    expect(r.stats.ignored.duplicate_listing).toBe(1);
    expect(r.run!.candidates).toHaveLength(1);
    expect(r.run!.candidates[0].proposed["Listings"]).toBe(2);
  });

  it("refuses to make a lead of fewer than 2 listings whatever the options", () => {
    const r = buildLeads(input({
      listings: [row("hatbox", "Disney Hatbox Ghost pin LE 3000 Haunted Mansion 50th Anniversary", { rejectionReason: "edition_size_conflict" })],
      options: { windowDays: 180, minListings: 1, minMarketplaces: 1 },
    }));
    expect(r.run).toBeNull();
  });
});

describe("leadScore", () => {
  const t = new Set(["a", "b"]);
  it("rises with size, sites and recency, within 0–100", () => {
    const small = leadScore({ members: [{ sourceId: "x", at: NOW - 100 * DAY, tokens: t }, { sourceId: "x", at: NOW - 100 * DAY, tokens: t }], seedTokens: t }, NOW);
    const big = leadScore({
      members: Array.from({ length: 12 }, (_, i) => ({ sourceId: `s${i % 3}`, at: NOW - DAY, tokens: t })), seedTokens: t,
    }, NOW);
    expect(small).toBeLessThan(big);
    expect(big).toBe(100);
    expect(small).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Unit tests for the exported normaliser / attribute parser and the v2 rules
 * (#407). The golden set measures overall precision; these pin specific
 * behaviours that SG-05 and SG-10 rely on.
 */
import { describe, expect, it } from "vitest";
import {
  isSetRecord,
  matchListing,
  normaliseTitle,
  parseAttributes,
  recordEditionKind,
} from "./matching";
import { fixturePin } from "./__fixtures__/load";

describe("normaliseTitle", () => {
  it("strips accents, folds pin's to pin and keeps English plurals", () => {
    expect(normaliseTitle("Pin's Fée Clochette – édition limitée")).toBe("pin fee clochette edition limitee");
    expect(normaliseTitle("Disney PINS lot")).toBe("disney pins lot");
    expect(normaliseTitle("Porte-clés Cœur")).toBe("porte cles coeur");
  });

  it("turns n/n counts into 'n of n'", () => {
    expect(normaliseTitle("Complete 4/4 set")).toBe("complete 4 of 4 set");
  });
});

describe("parseAttributes", () => {
  it("parses year, LE size and edition kind without reading the LE size as a year", () => {
    const p = parseAttributes("Hatbox Ghost Haunted Mansion LE 2000 pin 2019");
    expect(p.editionSize).toBe(2000);
    expect(p.editionKind).toBe("LE");
    expect(p.years).toEqual([2019]);
    expect(p.year).toBe(2019);
    expect(p.lang).toBe("en");
  });

  it("does not treat the French article 'le' as Limited Edition", () => {
    const p = parseAttributes("Pin's Simba Le Roi Lion");
    expect(p.lang).toBe("fr");
    expect(p.editionKind).toBeUndefined();
    expect(p.editionSize).toBeUndefined();
  });

  it("reads French edition sizes and LR / OE", () => {
    expect(parseAttributes("Pin's édition limitée à 800 exemplaires").editionSize).toBe(800);
    expect(parseAttributes("Stitch pin Limited Release").editionKind).toBe("LR");
    expect(parseAttributes("Stitch pin OE").editionKind).toBe("OE");
  });

  it("lists variant terms, bundles, sets, completeness, counts and exclusions", () => {
    const p = parseAttributes("Lot de 4 pin's coffret complet jumbo chaser PTD AP porte-clés");
    expect(p.variantTerms).toEqual(expect.arrayContaining(["jumbo", "chaser", "pin_traders_delight", "artist_proof"]));
    expect(p.bundleTerms).toEqual(expect.arrayContaining(["lot de", "lot"]));
    expect(p.setTerms).toContain("coffret");
    expect(p.completenessTerms).toContain("complet");
    expect(p.itemCount).toBe(4);
    expect(p.excludedTerms).toContain("porte cles");
  });

  it("guesses characters (EN and FR names, canonical English) and series", () => {
    const p = parseAttributes("Pin's Fée Clochette et Capitaine Crochet série Peter Pan");
    expect(p.charactersGuess).toEqual(expect.arrayContaining(["Tinker Bell", "Captain Hook", "Peter Pan"]));
    expect(p.seriesGuess).toBe("peter pan");
    expect(parseAttributes("Disney Stitch Mystery Pin Series").seriesGuess).toBe("stitch mystery");
  });

  it("does not read 'Mini Mouse' (a common misspelling) as the mini variant", () => {
    expect(parseAttributes("Mini Mouse pin").variantTerms).not.toContain("mini");
    expect(parseAttributes("Minnie mini pin").variantTerms).toContain("mini");
  });
});

describe("record helpers", () => {
  it("derives the record's edition kind and set status", () => {
    expect(recordEditionKind(fixturePin("hatbox"))).toBe("LE");
    expect(recordEditionKind(fixturePin("tink"))).toBe("OE");
    expect(recordEditionKind(fixturePin("stitchMystery"))).toBe("LR");
    expect(isSetRecord(fixturePin("princessSet"))).toBe(true);
    expect(isSetRecord(fixturePin("hitchhikingBox"))).toBe(true);
    expect(isSetRecord(fixturePin("hatbox"))).toBe(false);
  });
});

describe("matchListing v2 rules", () => {
  it("is opt-in: the default mode is v1", () => {
    expect(matchListing(fixturePin("hatbox"), "Hatbox Ghost pin").mode).toBe("v1");
    expect(matchListing(fixturePin("hatbox"), "Hatbox Ghost pin", { mode: "v2" }).mode).toBe("v2");
  });

  it("confirms a matching year and penalises (not rejects) a year one off", () => {
    const pin = fixturePin("orangeBird");
    const base = matchListing(pin, "Orange Bird Sunshine pin Flower and Garden Festival", { mode: "v2" });
    const same = matchListing(pin, "Orange Bird Sunshine pin Flower and Garden Festival 2022", { mode: "v2" });
    const offByOne = matchListing(pin, "Orange Bird Sunshine pin Flower and Garden Festival 2023", { mode: "v2" });
    expect(same.score).toBe(base.score + 10);
    expect(offByOne.accepted).toBe(true);
    expect(offByOne.score).toBe(base.score - 15);
  });

  it("ignores film / park years and years the record itself names", () => {
    const r = matchListing(fixturePin("jumboSimba"), "Simba Jumbo pin Lion King 30th Anniversary 1994 LE 500", { mode: "v2" });
    expect(r.accepted).toBe(true);
  });

  it("does not exclude 'Fantasyland' as 'fantasy' in v2 (v1 still does)", () => {
    const title = "Orange Bird Sunshine pin Flower and Garden Festival Fantasyland";
    expect(matchListing(fixturePin("orangeBird"), title, { mode: "v2" }).accepted).toBe(true);
    expect(matchListing(fixturePin("orangeBird"), title).rejectionReason).toBe("excluded_term");
  });

  it("lets a single-pin listing quote its record's set name", () => {
    const pin = { ...fixturePin("hatbox"), collection: "Hitchhiking Ghosts Boxed Set", title: "Gus Hitchhiking Ghost" };
    const r = matchListing(pin, "Gus Hitchhiking Ghost pin Hitchhiking Ghosts Boxed Set 2019 LE 2000", { mode: "v2" });
    expect(r.rejectionReason).toBeUndefined();
    expect(r.accepted).toBe(true);
  });

  it("accepts a product-code hit even when the name is short and generic", () => {
    const r = matchListing(fixturePin("figment"), "Disney pin 400020815822", { mode: "v2" });
    expect(r.accepted).toBe(true);
  });

  describe("records named only after a character", () => {
    const bare = (title: string, collection: string, character: string) => ({
      ...fixturePin("figment"),
      title,
      collection,
      edition: "Open Edition",
      normalisedSeries: `Disney Mystery Pins | 2025 | Walt Disney World | ${collection}`,
      searchAliases: `${collection}; Disney Mystery Pins; 2025; Walt Disney World; WDW`,
      characters: [character],
      externalIdentifiers: {},
      limitedEditionSize: undefined,
      releaseYear: 2025,
    });
    const toys = bare("Cheshire Cat", "Toys in a Box Mystery Collection", "Cheshire Cat");
    const fans = bare("Stitch", "Character Folding Fans Mystery Collection", "Stitch");

    // Real sold titles that were wrongly accepted in the 6 Nov 2026 staging test.
    it.each([
      [toys, "Loungefly Disney Cats & Dogs Halloween Mystery Pin - Cheshire Cat"],
      [toys, "Ducks of Disney Mystery Pin CHESHIRE CAT Duck"],
      [fans, "DISNEY LILO & STITCH CHRISTMAS HOLIDAY SWEATER MYSTERY PIN"],
      [{ ...fans, title: "Mickey Mouse", characters: ["Mickey Mouse"] }, "Walt Disney World Disney Mickey Mouse Film Strip Pin Single Contemporary"],
    ])("rejects another collection's pin: %#", (pin, title) => {
      const r = matchListing(pin, title, { mode: "v2" });
      expect(r.accepted).toBe(false);
      expect(r.rejectionReason).toBe("generic_name_no_series");
    });

    it("accepts a listing that names the collection", () => {
      expect(matchListing(toys, "Disney Toys in a Box Mystery Pin Cheshire Cat 2025", { mode: "v2" }).accepted).toBe(true);
      expect(matchListing(fans, "Disney Parks Character Folding Fan Mystery Pin Stitch", { mode: "v2" }).accepted).toBe(true);
    });

    it("rejects when one of two collection words is missing", () => {
      expect(matchListing(fans, "Disney Fans Mystery Pin Stitch", { mode: "v2" }).accepted).toBe(false);
    });

    it("rejects when the record has no usable collection name", () => {
      const r = matchListing({ ...fans, collection: "Uncategorised" }, "Disney Stitch pin", { mode: "v2" });
      expect(r.accepted).toBe(false);
    });

    it("still lets a product code identify the pin", () => {
      const r = matchListing({ ...toys, externalIdentifiers: { sku: "400020815822" } }, "Disney pin 400020815822 Cheshire Cat", { mode: "v2" });
      expect(r.accepted).toBe(true);
    });
  });

  it("keeps the score and parsed attributes on a rejection", () => {
    const r = matchListing(fixturePin("hatbox"), "Hatbox Ghost Haunted Mansion 50th Anniversary pin LE 3000", { mode: "v2" });
    expect(r.accepted).toBe(false);
    expect(r.rejectionReason).toBe("edition_size_conflict");
    expect(r.rejectionDetail).toBe("3000");
    expect(r.parsed.editionSize).toBe(3000);
    expect(r.score).toBeGreaterThan(40);
  });
});

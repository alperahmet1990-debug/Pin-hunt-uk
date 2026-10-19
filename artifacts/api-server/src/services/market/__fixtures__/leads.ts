/**
 * Test-only fixtures for marketplace leads (SG-10, #415): stored near-miss
 * rows covering every case in the issue's acceptance criteria. Titles are
 * synthetic and include seller-style words and a sentinel URL that must
 * never reach a leads file.
 */
import type { PinSetSummary } from "@workspace/pin-repository";
import { fixturePin } from "./load";
import type { CatalogueEntry, LeadListing, LeadsInput } from "../leads/leads";

export const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const KEYS = ["hatbox", "steamboat", "tink", "stitchMystery", "jumboSimba", "figment", "minnieEiffel", "orangeBird"] as const;
export const UUID: Record<(typeof KEYS)[number], string> = Object.fromEntries(
  KEYS.map((k, i) => [k, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]),
) as Record<(typeof KEYS)[number], string>;
export const CATALOGUE: CatalogueEntry[] = KEYS.map(k => {
  const pin = fixturePin(k);
  return { pinhuntId: pin.id, pin };
});
export const ANCHORS = new Map(KEYS.map((k, i) => [UUID[k], CATALOGUE[i]]));

export const SOURCES = [
  { id: "soldgraph:ebay_gb_sold", marketplace: "ebay", market: "UK" },
  { id: "soldgraph:ebay_fr_sold", marketplace: "ebay", market: "FR" },
  { id: "soldgraph:vinted_gb_active", marketplace: "vinted", market: "UK" },
];

export const SETS: PinSetSummary[] = [
  { id: "set-1", normalisedSeries: "haunted mansion 50th", setName: "Haunted Mansion 50th Anniversary", expectedPinCount: 5, releasedPinCount: 1, isComplete: false },
];

export const SENTINEL_URL = "https://www.ebay.co.uk/itm/URL_SENTINEL";
let n = 0;
/** A stored near-miss row. Titles carry seller-ish words that must never reach the output. */
export function row(pin: keyof typeof UUID | null, title: string, over: Partial<LeadListing> = {}): LeadListing {
  n += 1;
  return {
    sourceId: "soldgraph:ebay_gb_sold",
    externalId: `item-${n}`,
    pinUuid: pin ? UUID[pin] : null,
    title,
    price: 20 + n,
    currency: "GBP",
    soldDate: iso(10 + n),
    lastSeenAt: iso(2),
    rejectionReason: "year_conflict",
    matchScore: 50,
    ...over,
  };
}

/** Every fixture case named in #415's acceptance criteria. */
export function fixtureListings(): LeadListing[] {
  n = 0;
  return [
    // LE size discrepancy on Hatbox Ghost (catalogue LE 2000): 3 listings, one site.
    row("hatbox", "Disney Hatbox Ghost pin LE 3000 Haunted Mansion 50th Anniversary SELLERWORD", { rejectionReason: "edition_size_conflict" }),
    row("hatbox", "Hatbox Ghost Haunted Mansion 50th Anniversary pin LE 3000 fast postage", { rejectionReason: "edition_size_conflict" }),
    row("hatbox", "Disney Parks Hatbox Ghost LE 3000 pin Haunted Mansion 50th", { rejectionReason: "edition_size_conflict" }),
    // Year discrepancy on Orange Bird (catalogue 2022): 2 listings on 2 sites, one French.
    row("orangeBird", "Orange Bird Sunshine pin 2019 Flower and Garden Festival", { rejectionReason: "year_conflict" }),
    row("orangeBird", "Pin's Disney Orange Bird Sunshine 2019 Flower and Garden neuf", {
      sourceId: "soldgraph:ebay_fr_sold", currency: "EUR", rejectionReason: "year_conflict",
    }),
    // Jumbo variant of Tinker Bell Pixie Dust (EN + FR titles).
    row("tink", "Tinker Bell Pixie Dust Jumbo pin Peter Pan 70th Anniversary", { rejectionReason: "variant_not_in_record" }),
    row("tink", "Disney Tinker Bell Pixie Dust jumbo pin Peter Pan 70th", { rejectionReason: "variant_not_in_record" }),
    row("tink", "Pin's Disney Fée Clochette poussière de fée Jumbo Peter Pan 70th", {
      sourceId: "soldgraph:ebay_fr_sold", currency: "EUR", rejectionReason: "variant_not_in_record",
    }),
    // Missing set member: Madame Leota in Haunted Mansion 50th (a different pin from Hatbox Ghost).
    row("hatbox", "Madame Leota pin Haunted Mansion 50th Anniversary 2021 LE 2000"),
    row("hatbox", "Haunted Mansion 50th Anniversary Madame Leota LE 2000 pin 2021"),
    row("hatbox", "Madame Leota Haunted Mansion 50th Anniversary pin LE 2000", { sourceId: "soldgraph:vinted_gb_active", soldDate: null }),
    // Two missing pins of an unknown series (a possible set): 2 sites each.
    row("minnieEiffel", "Villains Masquerade series Ursula pin 2025"),
    row("minnieEiffel", "Villains Masquerade series Ursula pin 2025 boxed", { sourceId: "soldgraph:ebay_fr_sold", currency: "EUR", title: "Villains Masquerade series Ursula pin 2025" }),
    row("minnieEiffel", "Villains Masquerade series Maleficent pin 2025"),
    row("minnieEiffel", "Villains Masquerade series Maleficent pin 2025", { sourceId: "soldgraph:vinted_gb_active", soldDate: null }),
    // Single-listing noise: one LE-size near miss on Steamboat Willie.
    row("steamboat", "Steamboat Willie Mickey pin LE 500 Disneyland Paris 30th Anniversary", { rejectionReason: "edition_size_conflict" }),
    // Bundles and set listings: always ignored.
    row("hatbox", "Hatbox Ghost pin bundle LE 3000 Haunted Mansion", { rejectionReason: "edition_size_conflict" }),
    row("hatbox", "Job lot Hatbox Ghost pins LE 3000", { rejectionReason: "edition_size_conflict" }),
    row("hatbox", "Haunted Mansion boxed set Hatbox Ghost LE 3000 pin", { rejectionReason: "edition_size_conflict" }),
    row("hatbox", "Haunted Mansion 4 pins Hatbox Ghost LE 3000", { rejectionReason: "edition_size_conflict" }),
  ];
}

export function input(over: Partial<LeadsInput> = {}): LeadsInput {
  return {
    listings: fixtureListings(),
    sources: SOURCES,
    catalogue: CATALOGUE,
    anchors: ANCHORS,
    sets: SETS,
    options: { windowDays: 180, minListings: 3, minMarketplaces: 2 },
    now: NOW,
    gitCommit: "0123456789abcdef0123456789abcdef01234567",
    ...over,
  };
}

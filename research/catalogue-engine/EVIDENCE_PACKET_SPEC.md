# Evidence packet spec (v1)

An evidence packet is a JSON file of **claims**. A claim is one fact, from one source, about one field of one pin or set. Collectors (research agents, the live fetcher, or a human with a physical pin) write packets. The engine never writes facts of its own: every value in its output traces back to one or more claims.

```json
{
  "packet_id": "bm-evidence-2026-10-13-a",
  "spec_version": 1,
  "collected_at": "2026-10-13",
  "collector": "agent:web-search",
  "sources": [
    {"url": "https://www.disneystore.co.uk/...", "title": "…", "publisher": "Disney Store UK",
     "published_date": "2026-03-03", "accessed_via": "search_snippet", "page_readable": false}
  ],
  "sets": [
    {"set_key": "brush-of-magic/mystery-series-2", "parent_set_key": "brush-of-magic",
     "claims": [ {"field": "expected_pin_count", "value": 10, "source_url": "https://…", "method": "search_snippet", "note": "listing says 10 designs, 2 per box"} ]}
  ],
  "pins": [
    {"pin_key": "brush-of-magic/mystery-series-2/pinocchio", "set_key": "brush-of-magic/mystery-series-2",
     "claims": [ {"field": "characters", "value": ["Pinocchio"], "source_url": "https://…", "method": "search_snippet", "note": "…"} ]}
  ],
  "not_found": [ {"key": "brush-of-magic/mystery-series-2/pinocchio", "field": "product_code", "searched": "official listing; 3 queries", "note": "no per-pin code published"} ],
  "discovery_notes": "free text"
}
```

## Rules
- `method`:
  - `page_fetch`: the page was read directly.
  - `search_snippet`: seen only in a search-engine summary.
  - `physical_pin`: observed on a pin we hold.
  - `editorial`: general knowledge, e.g. which film a character is from. The engine shows it but **never counts it as evidence**.
- One claim per (field, source). If two sources disagree, record both. Never pick a winner in the packet.
- `note` is a short paraphrase in your own words (≤ 200 chars). Never paste product descriptions. Never include images.
- **Excluded sources:** pinandpop.com, pinpics.com, pintradingdb.com. The engine rejects claims from them. Marketplaces (eBay, Amazon resellers, Mercari) are not evidence.
- **Never invent:** if a fact is not stated by a source, do not claim it. Record the gap in `not_found` instead.
- Keys are lowercase slugs: `family/subset/subject`. Keys are opaque identifiers, not facts.

## Fields

**Pin fields**
- Identity: `pin_name`, `characters` (list), `main_character`, `franchise`, `attraction`.
- Release: `set_position`, `edition_type`, `edition_size`, `release_date` (YYYY-MM-DD or YYYY-MM), `release_year`, `release_location` (park/store/retailer), `region`.
- Pricing and codes: `original_price`, `currency`, `product_code`, `pack_product_code`, `is_chaser`.
- Visual: `visual_description`, `visual_form` (e.g. door, window, duck), `visual_colours`, `visual_features` (e.g. pin-on-pin, hinged, glitter, stained glass).
- Physical: `front_text`, `backstamp_text`, `size_mm`, `materials`.
- Grouping: `pin_structure` ("one pin" when a source says the characters share one pin; "separate pins" when it says they are separate). A "separate pins" claim on a multi-character record blocks sign-off.

**Set fields**
- Identity: `set_name`, `family`, `sub_series`, `issuer`, `format`.
- Contents: `expected_pin_count`, `pins_per_box`, `has_chaser`.
- Release: `release_date`, `release_location`, `region`, `edition_type`, `edition_size`.
- Pricing and codes: `price`, `currency`, `pack_product_code`.

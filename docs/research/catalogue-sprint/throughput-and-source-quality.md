# Catalogue sprint: extraction throughput and source quality

**Goal:** thousands of *accurate individual pins*, not set names.
"Accurate" here means directly verified: a person opened the source (or the pin) and confirmed it. Search snippets never count as direct verification.

## What limits us today (measured in Wave 1 and the gap-fill)
1. **Search cap.** All research helpers in one turn share a hard limit of **200 web searches**. Wave 1 used about 185 searches for 295 named pins (~1.6 per search). Gap-fill plus Wave 2 used about 185 searches for 469 named pins (~2.5 per search), with round-up-first queries. See `docs/research/catalogue-runs/2026-10-14-consolidated-wave1-gapfill-wave2.md`.
2. **Snippets truncate lists.** A release post that lists 12 designs typically shows 2–5 names in a search summary. That is why 97 Wave 1 sets had no named pins and 28 were incomplete.
3. **No page reads.** The network policy blocks every target host. Even permitted reads would need a terms and robots check first (`source-access.md`).
4. **Per-pin human verification.** Every approval needs a person to open a source per pin. Issue #230 proposes set-level checks.
5. **Source mix.** In Wave 1, 59% of claims came from fan or unclassified blogs. DLP had **no official source at all**.

## Levers, ranked by accurate pins gained
| # | Lever | Effect | Needs | Policy fit |
|---|---|---|---|---|
| 1 | **Set-level verification** (#230) | One source open verifies every listed pin of a set. Turns candidates into *verified* pins about 5–10× faster. | Approve #230; staging (laptop) | Fully within policy; human verification |
| 2 | **Permitted page reads of round-up posts** (news/fan: Laughing Place, WDWNT, DLP Report, Disney Pins Blog, Mousesteps, …) | One page gives the complete design list of a release (all pins, edition sizes, prices). Snippet truncation disappears. Expected several times more pins per request (to be measured in a 20-page pilot). | Allow the hosts in network settings; read each site's terms and robots; record in `access_policy.json`; prefer RSS | Only after per-host checks. Evidence stays **fan/news class**: a page read raises completeness, not official status. |
| 3 | **Official structured data**: Disney Store affiliate product feed (CJ, UK and US) | Per-SKU name, item code, price and dates from Disney itself. Official class at scale. | Affiliate application plus a licence check for non-promotional catalogue use | Licence-based, not scraping |
| 4 | **Human official capture for DLP**: monthly pin release posters, DLP app, Pueblo Trading Post signage | DLP is the gap with no official source. A person transcribes a poster into Research Review as `human_direct_check` evidence (one poster ≈ a month of releases). | Maintainer or trusted collectors; a simple capture form later | Within policy; physical and official observation |
| 5 | **Collectors' own pins** (`physical_pin`): backstamp text, edition size and front text from pins users scan or own | The strongest evidence class for pins we can see. Grows with the community. | Product and privacy decision, consent, a future scan-to-evidence path | Within policy; needs consent design |
| 6 | **More search budget**: run waves across several supervised turns or parallel supervised sessions (each gets its own 200) | Linear: about 300 named candidate pins per 200 searches with snippets | Your go per wave; not an autonomous schedule | Within policy |
| 7 | **Query efficiency**: shared query log across helpers, round-up-first queries, no re-search of filled sets, publisher-targeted queries | About 1.5–2× pins per search (estimate) | Engine and brief changes (research branch only) | Within policy |

## Source-quality rules (unchanged, now explicit in every report)
- **Official (Disney Store, Disney Parks, DLP), news and fan stay separate classes** in the engine and in Research Review. One vote per publisher.
- `search_snippet` is never direct verification. `page_fetch` of a fan or news site is not official.
- **Only a person's direct check** (`human_direct_check`) or a physical pin makes a pin *verified*.
- **Source register decision needed.** Mousesteps, My Pin Central, PixieDust DLP and Disney Pinventory are "unclassified" today and carry fan weight. Classify each as fan or news. This is a human decision; keep them out of "official" regardless.
- Planned-release schedules (e.g. Mousesteps pre-release posts) should carry a "planned" marker. Proposed engine change: a `planned: true` claim flag that caps confidence at Low until a post-release source agrees.

## Recommended sequence
1. **Now, without the laptop:** allow 3–5 news and fan hosts in network settings. Basil then reads their terms and robots, records them, and runs a 20-page pilot to measure pins per request.
2. **Laptop:** apply 045 to staging and load `out/wave1` and later payloads into Research Review. Start direct checks set by set.
3. **Approve #230** so direct checks become per set.
4. **Apply to the Disney Store affiliate programme.** Start a DLP poster capture habit.
5. **Continue waves** (Loungefly, Disney Store US, backfill to 2020) with the query-efficiency changes.

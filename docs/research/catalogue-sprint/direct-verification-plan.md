# Direct verification at scale: the fastest compliant route

Status: proposal.
- Every research record stays a **candidate** until a person checks it directly.
- Nothing is imported. Nothing here changes staging or production.

## The bottleneck
- **Policy.** Only a person's direct check (or a physical pin) verifies a pin. Search snippets never do. Secondary sites, however many, never do.
- **No working review tool yet.** Research Review is in `main`, but it needs migration 045 on staging plus an app/API build pointed at staging. Neither exists yet.
- **One page open per pin.** Today a check is recorded pin by pin. At 1–2 minutes each, 842 pins take about **14–28 hours**.
- **No compliant machine access to official pages.** Disney's terms appear to prohibit automated access. Network access is blocked anyway. So official pages can only be opened by a person, in their own browser.
- **No official source for DLP at all,** and only 2 of 148 WDW pins have one.

## What the worklist shows
`research/catalogue-engine/out/consolidated/verification_worklist.xlsx` has one row per *page to open*, with the candidate pins that page names.

| Measure | Value |
|---|---|
| Candidate pins | 842 |
| Pins named on a cited page | 739 |
| Pages to open to cover them | 343 |
| Official pages | 73, covering 203 pins |
| **DSUK High-confidence pins** (after the Pinventory decision and pass 4) | **101** |
| Official pages covering them | **24** (about 4 pins per page, up to 16) |

**With set-level checks (#230):** about 2 minutes per page. That puts **DSUK High at about 50 minutes** and all 343 pages at about 11–12 hours.

## Recommended route, fastest first
1. **Unlock Research Review on staging** (laptop, about 30–45 minutes).
   - Apply 045 to staging and run `045_verify.sql`.
   - Run the app and API against staging.
   - Load `out/consolidated/staging_payload.json` (4.3 MB, under the 5 MB limit).
2. **Start with the DSUK High sheet now** (24 Disney Store UK pages, 101 pins).
   - Open each page in your own browser and confirm each pin in Research Review.
   - Per-pin checks work today, so this needs no new code.
3. **Ship set-level verification (#230).** It is approved and in the backend queue, but it has no priority label, so it may wait behind other work.
   - Add a priority label, or ask me to build it here under the normal PR, QA and security review.
   - It turns one page open into N verified pins, plus one batch approval per set.
4. **Batch review in set order.**
   - Order: official pages first, then news pages (after the access checks in step 5), then fan pages.
   - Blocking conflicts (17 pins) and flagged duplicates (33) are excluded from batches and reviewed one by one.
5. **Approved machine access, to improve candidates (not to verify them).**
   - Allow 3–5 news hosts in network settings: Laughing Place, WDWNT, DLP Report.
   - Basil then reads and records each site's terms and robots rules. You approve each host in `access_policy.json`.
   - Full page reads give complete release lists, so the reviewer sees fewer wrong or missing pins.
   - Fetched secondary pages still **do not verify**.
6. **Licensed official data for DSUK: a decision for you.**
   - Apply to the Disney Store affiliate programme (CJ).
   - If the feed licence allows catalogue fact-checking, decide whether an **exact item-code + name match against the official feed** may count as verification for Disney Store products.
   - That is the only route that verifies DSUK at scale without a person per page.
7. **DLP official evidence by people.**
   - Monthly release posters in the park, the DLP app, or Pueblo Trading Post signage, entered as human direct checks.
   - Optional later: extend the reviewer role beyond the App Creator to trusted collectors. That is an RLS and auth change, so it needs its own approval and security review.

## Not recommended
- **Browser automation or scripted reading of Disney sites.** It breaches the likely terms.
- **Treating multi-site agreement as verification.** Sites usually repeat one announcement. The engine now traces declared repeats to their source (`derived_from`) and caps secondary-only evidence at Medium.
- **Bulk "approve all".** #230 keeps per-pin ticks, unticked by default.

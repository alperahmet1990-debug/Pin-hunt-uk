# Research engine review — security, source compliance, evidence quality, ID safeguards

**Scope:** `research/catalogue-engine/` at this branch, plus the existing import paths it would feed.

**Method:**
- Code read-through.
- Measurements on the 13 Oct run (`out/`).
- 21 unit tests, including new hardening tests.

**Fixes made in this pass** (prototype only):
- Spreadsheet formula injection neutralised.
- Non-http(s) and over-long URLs rejected.
- Values over 600 characters rejected as likely pasted text.
- Control characters stripped from notes.
- Packet size capped.

## 1. Security

| Area | Finding | Status |
|---|---|---|
| Data access | No credentials and no Supabase or app calls. Reads only the repo workbooks and packets. The agent guard also blocks DB, Supabase and paid-API commands in cloud runs. | OK |
| Outbound network | Only `fetch.py` makes requests. It uses an allowlist of official and news hosts, checks robots.txt (unreachable robots.txt means no fetch), sends an identifying user agent, waits 5 s per host, caps reads at 2 MB, and stores no page text. | OK. The user-agent contact address is a placeholder: set a real role mailbox before any live run. |
| Untrusted input | Packets and web text are treated as data. Fields and methods are enumerated, URLs are scheme-checked, values have length caps, and notes have control characters stripped. | **Fixed** this pass |
| Output injection | Source-derived strings beginning `= + - @` could run as formulas in Excel or Sheets. | **Fixed** (`safe_cell`, test added) |
| Admin UI rendering (future) | Notes and URLs will be shown to admins. Render as plain `<Text>`. Open links with `Linking.openURL` only after an `https:` check. | Design requirement (03) |
| Prompt injection into the agent | Web pages can carry instructions. The role file says content is data. The engine has no tool access, so injected text can only land as a rejected or reviewable claim. | Design control (02) |
| Secrets in repo | None. Packets hold public URLs and facts only. The repository is public, so packets must never include personal data. Collector posts are cited by URL only. | OK |

## 2. Source compliance

- **Excluded sources:**
  - Pin & Pop, PinPics and PinTradingDB are rejected in code (`sources.py`) and, in the proposed staging table, by a CHECK constraint.
  - **0 accepted claims** cite them. Their names appear only in agents' free-text discovery notes ("seen, not used").
- **Marketplaces** are rejected as evidence.
- **Facts, not content:**
  - No images are stored.
  - Notes are paraphrased, 240 characters or fewer.
  - The fetcher's JSON-LD extraction drops `description`.
  - Factual data (names, dates, prices, edition sizes) is low risk. The 600-character value cap now stops pasted descriptions.
- **Access restrictions:**
  - Every page read in this environment was blocked by network policy.
  - Agents recorded the blocks and did not work around them.
  - All 2,375 claims are `search_snippet`.
- **Gap:** terms-of-use review per host (Disney Store and each news site) is still **needed before enabling live fetching**. That is a maintainer or legal decision.

## 3. Evidence quality (13 Oct run)

| Measure | Value | Read |
|---|---|---|
| Claims by class | fan 1,120 · official 727 · news 309 · editorial/none 59 · unclassified 4 | Official share is good for a snippet-only run |
| Method | 100% `search_snippet` | **Main weakness:** a snippet can mis-summarise a page. Direct verification is mandatory before approval (workflow step 3). |
| Independent publishers per verified pin | median 4, min 1 | Min 1 = an official listing alone (Disney Classics London) |
| Roster attribution | 19 URLs supply character claims for 159 pin-records (checklist pages) | Correct for checklists. The reviewer spot-checks one pin per roster URL. |
| Series-wide visual claims | 15 statements cover 115 pin-fields | Real visual descriptors per pin are still missing. Our own photos are the fix. |
| Conflicts | 4 blocking (edition size); 60 variants; 37 regional variants | Correctly separated |
| No-invention audit | 846 populated fields, 0 without evidence | Pass |
| "Announced" vs "released" | Not modelled. Tiki Room (13 Oct) comes from previews. | **Gap:** add `release_status` to the spec (v2) |

## 4. Duplicate and ID safeguards

**What the engine does**
- Never mints or reuses a `pinhunt_id`.
- Duplicate detection runs product code → same set family plus series number plus mystery/single-pin line → character or name overlap → fuzzy spelling (flagged as PROBABLE, review). It found exactly the 25 known duplicates. Regression test: a Captain Hook LE single is not merged into the Mystery Series 1 Peter Pan.
- Duplicates are output as `RESEARCH-DUPLICATE`, meaning "compare and enrich", never "overwrite".

**What the existing import paths do (the root cause of the 86 reused IDs)**

| Path | Matching | Risk |
|---|---|---|
| `routes/catalogue-import.ts` (admin Excel import) | `upsert(..., { onConflict: "pinhunt_id" })` | A row with an existing ID but a different pin **overwrites** it. Same failure mode as July. |
| `scripts/import-trusted-catalogue.mjs` | Matches by pinhunt_id first, no identity check | Caused the 86. |
| `scripts/import-collectible-pintrader.mjs` | Mints `max(pinhunt_id)+1` in process | Safe from reuse, but racy if two imports run at once. |

**Recommended safeguards** (proposals, need approval):
1. **Identity guard.**
   - DB trigger: `pinhunt_id` is immutable, and an UPDATE that changes both title and main character is blocked unless an audited admin path opts in.
   - Importer-level check before any upsert: when matching by `pinhunt_id`, the incoming name, character and series must agree with the existing row, or the row is rejected to review.
   - Draft in `proposed_045_…sql.draft` §6.
2. **ID minting.** Replace `max()+1` with `next_pinhunt_id()`, a sequence (§5).
3. **Research imports only insert new pins.** Matches to existing pins become field-level suggestions applied through the existing audited `apply_validation_changes` / `pin_change_audit` pattern.

## 5. Residual risks

- **Snippet-only evidence** until live fetching is allowed. Mitigation: mandatory human direct-source check.
- **Single-publisher sets.** Animated Cuties S2 and Brush of Magic S2 are named only by one fan blog. They stay out of the pilot.
- **Rule-based duplicate matching** is tuned to today's 182-row catalogue. Re-validate before the catalogue grows past about 2,000 pins.

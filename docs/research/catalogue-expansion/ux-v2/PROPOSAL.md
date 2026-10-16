# Research Review v2: Set Board, OE Review and AI preparation

**Status:** proposal for your review, 16 Oct 2026. Nothing has been implemented, no tickets were created, and Supabase and the development agents were not touched.

**Mock-up:** `review-v2.html`. Open it in a browser and add `?view=` with one of these: `queue`, `oe-compact`, `oe-source`, `oe-dup`, `set-626`, `set-edit`, `set-missing`. Screenshots at iPad (1180×820) and desktop (1440×900) are in this folder.

**Data:** every pin, set, source and flag in the mock-ups comes from the real research backlog (`research/catalogue-engine/out/consolidated/staging_payload.json`: 871 pins, 143 sets). The exceptions are labelled in the mock-up: illustrative timestamps, and the example name typed into a missing slot.

---

## 1. What exists today, and what v2 reuses

v2 stays **inside the existing admin screen** (`artifacts/pinhunt/app/admin/research-review.tsx`) and the existing API and schema. It is not a separate tool.

| Part | Today | v2 |
|---|---|---|
| Staging schema (migration 045): `catalogue_candidates`, `catalogue_evidence`, attribution columns, approval constraints | Works; append-only evidence | **Reused as is.** Corrections, duplicate decisions and added pins can all be stored as `human_direct_check` evidence rows and candidate rows. As far as I can tell **no new migration is needed for v1** (to be confirmed at design time) |
| API rules (`checkDecision`, set batch cap of 60, approval needs a direct check by a person) | Works, tested | **Reused.** Confirm = the existing direct-check call followed by the decision call |
| Set direct-check and decision routes | Work | **Reused** by the Set Board |
| Page view (pins grouped by source page) | Works | Becomes Lane A grouping and "open official page" |
| Admin screen layout | Three stacked full-screen modals (set, page, candidate). Closing one loses your place | **Replaced** by a list or board plus a side panel plus a source sheet. You stay on the same screen |
| Recording a check | You **paste the https link** of the page you opened (`research-review.tsx:770`), then tick fields | The link is **filled in** because you opened the page from the review screen |
| Images | None shown | Shown only where we may (see §5); otherwise a compact card with a link to the official photo |
| Local "Pin check" page (`research/catalogue-engine/tools/review_ui`) | Offline prototype | Superseded; kept as an offline tool |

### Gaps found in the current implementation

These would need decisions or small API changes.

1. **No way to edit a candidate.**
   - There is no route to correct a character, name or field. Conflicts can only be rejected.
   - 30 pins carry `conflict:` reasons, including the "hold: possible duplicate" ones. `checkDecision` refuses to approve them, and nothing can clear the flag.
   - **Proposed:** a correction route and a "resolve flag" route, both written as evidence rows (old value → new value, source, reviewer, time).
2. **Low-confidence pins can never be approved, even after you check them.**
   - `checkDecision` requires High or Medium `record_confidence`, and a direct check by a person doesn't change it.
   - That blocks **360 of 871 pins** permanently, including 10 that cite an official page.
   - **Decision for you:** allow approval when you have directly checked the identity fields on an official page, or on 2 independent news pages.
3. **Variant values block batch approval.**
   - 114 pins have regional variants (price, currency, date, name).
   - The set route sends each one back with "approve it on its own with a note".
   - **Proposed:** you tick which market's values you saw, which is recorded per market (the engine's existing `by_market` shape), and the pin can then be batch-approved.
4. **It won't scale past about 1,000.**
   - The list, set and page queries are capped at `limit(1000)` per run, with no paging.
   - **Proposed:** server-side paging by lane, line and set, plus a "next 50" queue.
   - Lanes can be computed from existing columns; no new column is needed at first.
5. **The duplicate-pin preview shows `pins.image_url` without a rights check.**
   - **Proposed:** take the image from `pin_images` where `public_display_allowed` is true.
6. **Pin & Pop reference images (migration 042) are admin-visible today.**
   - **Proposed:** the review screen does **not** show `source = 'pin_and_pop'` images while the API discussion is pending. This is your call; it is excluded in the mock-ups.
7. **Some evidence comes from sources we don't count.**
   - 76 pins cite disneypinventory.com, whose terms forbid robots. Others cite forums and social posts.
   - 8 pins have no other source.
   - **Proposed:** these show as "lead only" and never count towards verification. The Encanto set in the mock-up shows how this looks.

---

## 2. The screens

### Queue (`queue-desktop.png`)

- Opens on four lanes prepared in advance: **A** one page confirms it, **B** quick check, **C** needs a decision, **D** parked.
- Your priority lines (WDW, DLR) get their own row, with an honest note: the backlog has **0 WDW/DLR open-edition pins**, because the US pass collected LE and LR only. The OE research pass is what fills that row.

### OE & singles (`oe-compact-*.png`, `oe-source-ipad.png`, `oe-dup-desktop.png`)

- **Compact mode:** one row per pin, with no empty image boxes.
- **Detailed mode:** a full card, side-by-side compare and highlighted conflicts.
- Filters: WDW+DLR, standalone only, lane, years, "has image we may show".
- Each row has Confirm (tick), **Edit** and **Skip**. Possible duplicates are held, with **Compare** instead of a tickbox.
- **Source sheet:** tap "Open source" and the page opens in an in-app browser sheet (Safari view on iPad; side panel or new tab on desktop). The list stays where it was. You tick what the page shows (nothing pre-ticked, or "Tick all 5 shown" as an explicit button), and the URL and time are recorded for you.
- **Batch:** tick several, then "Verify N ticked pins". A pin can be ticked only after a page was opened for it, or if it's on a page you already opened.
- **Keyboard:** <kbd>J</kbd>/<kbd>K</kbd> move, <kbd>O</kbd> open, <kbd>X</kbd> tick, <kbd>E</kbd> edit, <kbd>S</kbd> skip, <kbd>⇧V</kbd> verify. On iPad everything is a tap.

### Set Board (`set-626-*.png`, `set-edit-ipad.png`, `set-missing-ipad.png`)

- **Left rail:** a set navigator with progress per set. <kbd>[</kbd> <kbd>]</kbd> move to the previous or next set. It is hidden on narrow screens.
- **Header:** **expected / identified / missing / flagged / ticked**, all computed from the same rows. "Expected" comes from the set record, "identified" from candidate pins, "missing" = expected − identified.
- The complete set shows together: known tiles and dashed missing slots. Every tile starts unticked.
- Flags appear on the tile:
  - AI suggestion (lavender)
  - one pin or two? (plum)
  - possible duplicate (red, held)
  - missing field (amber)
- **Side panel:** set facts you confirm once for all pins, evidence, conflicts, and image rights, kept separate.
- **Edit sheet:** correct characters, name or any field. The old value is shown struck through, an AI suggestion comes with its reason and source, and saving records old → new, source and reviewer.
- **Add missing pin:** tap a dashed slot, type the character you see, and set fields are inherited. The new pin is created **unverified** and then verified like the rest.

---

## 3. The five workflows: clicks and time

Time is **estimated** from: a tap ≈ 1–2 s, reading a source page ≈ 15–40 s, typing a name ≈ 5–10 s. "Today" means the current admin screen. The pilot should measure these for real.

| # | Workflow (real backlog example) | Steps in v2 | Clicks / taps | Time (est.) | Today (est.) |
|---|---|---|---|---|---|
| 1 | **Verify 5 standalone pins** (Deadpool 10th LR, Tiana's Sweet Treats LR, Aladdin & Jasmine Valentine's LR, Expedition Everest Yeti LE, Dumbo 85th LE) | For each: <kbd>O</kbd> open source → read → "Tick all shown" (or tick 2–5 fields) → "Save & tick". Then "Verify 5 ticked" → confirm | **17** minimum (3 per pin + 2); up to 32 if ticking fields one by one | **2.5–4.5 min** (30–55 s per pin) | ~12 actions per pin, plus switching apps to copy each URL: **8–10 min** |
| 2 | **Verify a complete mystery set** (Experiment 626 mystery set 2026, 10 pins, one official page) | Open set (or <kbd>]</kbd>) → "Open official page" → read → "Select all 10 on this page" (or 10 taps) → tick set facts (0–3) → "Verify 10" → confirm | **5–17** | **1.5–3 min** (≈10–18 s per pin) | Set modal plus a pasted URL, then a separate decision: **4–6 min** |
| 3 | **Correct a wrongly identified character** ("627; Experiment 627; Stitch" → "Experiment 627; Stitch", same set) | Tap the flagged tile's **Edit** → "Use suggestion" (or type) → "Save & tick" | **3** (+ typing if no suggestion) | **20–60 s** (page already open) | **Not possible:** no edit route, only reject |
| 4 | **Resolve a possible duplicate** (DLR Super Jumbo 70th, LE 250, vs Jumbo Countdown 70th, LE 3,000) | **Compare** → side-by-side differences highlighted → open 1–2 sources in the sheet → "Different pins: release the hold" → keep or edit the pre-filled reason | **5–7** | **1–2 min** | **Not possible** for "hold" flags: approval is refused and nothing clears the flag |
| 5 | **Add a missing set member** (Encanto mystery puzzle pin: 10 of 12 known, 2 missing) | Tap the dashed slot → type the character from the page or checklist → "Add pin (11 of 12)" → later tick and verify with the set | **2** + typing (then +1 tick) | **1–2 min** (most of it is finding the pin on the page) | **Not possible:** no add route |

**What this means for the real backlog (estimates; dedupe against live CTP may shrink it):**

| Lane | Pins | Time per pin | Your time |
|---|---|---|---|
| A: one page confirms it (71 pages) | 184 | 10–25 s | 30–75 min |
| B: quick check | 37 | 40–60 s | 25–40 min |
| C: needs a decision | 79 | 1–2 min | 1.5–2.5 h |
| **Total reviewable now** | **≈300** | | **≈3–4.5 hours** |
| D: parked | 571 | – | Not your time: needs more research first (DLP posters, OE pass, second sources) |

---

## 4. AI-assisted preparation (before anything reaches you)

**Principle:** AI and rules prepare, flag and suggest. **They never tick, verify or approve.** Every suggestion is stored separately from the engine's proposed values and from your decision, so the audit trail shows engine → suggestion → you.

| Step | What it does | Data it uses | Where it runs | Permitted? |
|---|---|---|---|---|
| P1 Live match | Matches each candidate against **all live pins**: product number or external ID exactly, then normalised title + character + year, then set + character. Marks *same as live*, *possibly same* or *new*. Today the engine checks only the 182 trusted rows | Our own database | API at load time (service role, read-only on `pins`) or engine using the QUERY 1 export | Yes (own data) |
| P2 Cross-candidate dupes | Same design proposed twice (e.g. Super Jumbo vs Countdown; Stitch in two 2025 mystery sets) | Backlog | Engine (exists) | Yes |
| P3 Source tiering | Counts only permitted sources. Pinventory, forums, social and fandom become "lead only". Excluded databases are already blocked by a 045 constraint. Search snippets never count as a direct check | Evidence rows | Engine | Yes |
| P4 Consistency checks | Duplicated names ("627" + "Experiment 627"), expected vs identified count, price and currency by market, missing fields, one pin or two | Candidate and set fields | Engine (rules) | Yes |
| P5 Suggested corrections | An LLM reads **only data we already hold** (candidate fields, evidence values and snippets, sibling pins) and returns `{field, from, to, reason, evidence_ids}`. Shown as a suggestion with its evidence; never written into the proposed values | Held data only; **no page fetching** | API server through the existing OpenAI integration | Yes. Cost: est. under £5 per 1,000 pins |
| P6 Lanes and page groups | Assigns lane A/B/C/D and groups pins by the official page that lists them, so one page check covers several pins | All of the above | Engine or API | Yes |
| P7 Link prep | Pre-fills "open official page" and "see official photo" links (link out only) | Evidence URLs | Engine | Yes |

**What preparation cannot do (legally):**
- Open Disney Store, shopDisney or DLP pages automatically. The Disney terms ban robots and data mining, and the UK AI opt-out applies. A person opening the page is the verification step, and v2 makes that one tap.
- Use Pin & Pop, PinPics, PinTradingDB or Stewpins in any way.
- Turn search snippets into verification.

**Measuring it:** log the acceptance rate of each suggestion. If a suggestion type is accepted more than 95% of the time over 200 or more cases, it can be shown more prominently. It still needs your tap.

**Lane D (571 parked) needs new sources, not more review:**
- DLP monthly posters photographed by you. The vision prototype read 108 of 108 fields on synthetic posters.
- The WDW/DLR OE research pass.
- Second sources for single-source pins.

---

## 5. Images and permissions

- A tile or row shows a picture **only** if we hold one we may display: our own photo, an approved contributor photo (migration 038, with licence), or a CTP image. CTP images carry a "licence evidence pending" label until the variant is recorded.
- Otherwise the card is compact, with **"See the official photo ↗"**. That opens the publisher's page in the source sheet; nothing is copied, cached, hotlinked or reframed.
- Image rights are shown in a separate panel and recorded separately. Verifying facts never changes an image's rights.
- No Pin & Pop images, including the admin-only 042 reference rows, while the API discussion is pending (your call).
- No scraping; no PinPics, Stewpins or PinTradingDB data.

---

## 6. Scale (thousands of candidates)

- **Lanes first:** at today's numbers, about 65% of the backlog is parked automatically, so you see about 300, not 871.
- **Server-side paging** by lane, line and set; "next 50" loading; no 1,000-row cap.
- **One page → many pins:** Lane A averages 2.6 pins per official page (Disney Store sets up to 16).
- **Keyboard and tap shortcuts** throughout. Skip sends a pin to the back of the queue rather than losing it.
- **Every action is a short API call** that reuses the 045 rules, so batch actions stay auditable per pin (`direct_verified_by`, `decided_by`, evidence `checked_by`, times).

---

## 7. What approval would mean (not started)

If you approve these screens, the build is roughly:

1. Admin screen layout: list or board + side panel + source sheet, compact and detailed modes, set navigator.
2. API:
   - paging by lane;
   - correction route;
   - resolve-flag route;
   - add-member route;
   - image rights filter on the duplicate preview;
   - combined confirm (direct check + decision).
3. Engine: P1 against live, P3 to P7.
4. Two rule decisions from you: §1 gap 2 (Low confidence after a direct check) and gap 3 (variants by market).

No tickets have been created; that waits for your go-ahead. Supabase is unchanged, and the development agents were not involved.

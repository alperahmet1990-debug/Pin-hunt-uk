# Research Review v2: technical implementation plan

**Status:** plan for your review, 16 Oct 2026. Nothing has been implemented. No tickets were created, the agent queue is unchanged, and Supabase was not touched.

**Builds on:**
- `PROPOSAL.md`, with your three decisions (16 Oct);
- the existing Research Review screen (`artifacts/pinhunt/app/admin/research-review.tsx`);
- the API (`artifacts/api-server/src/routes/research-review.ts`, `research-import.ts`, `lib/research-run.ts`, `lib/research-import.ts`);
- migration 045.

**Primary objective stays first.** WDW and Disneyland California open-edition coverage does not wait for this build (see §1, Track 0).

---

## 0. Pin & Pop exposure audit (decision 3)

I read the code and migrations only. Nothing was sent to Pin & Pop.

| Path | What it exposes | To whom | Finding |
|---|---|---|---|
| Collector app (catalogue, pin detail, collection) | Reads `pins.image_url` only; never reads `pin_images` (`lib/pin-repository` uses `pin_images` only in the contributed-photo methods) | Everyone | **No Pin & Pop images in code paths.** Live data is unverified; see the SQL below |
| `pin_images` RLS (038) + check constraint (042) | Pin & Pop rows must have `public_display_allowed = false` and no uploader; non-public rows are readable by **admins only** | Admins | Collectors protected at the database level |
| **Admin › Contributed images** (`app/admin/contributed-images.tsx:179-183`) via `GET /api/admin/pending-pin-images` (`routes/pin-images.ts:94-101`) → `getPinAndPopReferences` (`supabase-user-repository.ts:1281-1325`) | Shows the **Pin & Pop-hosted image** beside each contributed photo and an "Open on Pin & Pop" link | Admins | **Exposed. Every time an admin opens this screen, their device loads images directly from Pin & Pop's servers.** That is a request to their infrastructure. **Hide now (item S-1, S-2)** |
| Research Review duplicate preview (`research-review.ts:216-220`) | Returns `pins.image_url` with no rights check | App Creator | Only a risk if a live `image_url` points at Pin & Pop. Fixed by API-9 |
| Trusted-catalogue importer (`import-trusted-catalogue.mjs:227-230`) | Copies the workbook's "Front/Back image URL" into `pins.image_url` | Everyone (if set) | The repo workbook has **0 of 182** image URLs filled. Production must be confirmed with the SQL |
| `pins.source_url`, `pins.external_identifiers.pin_and_pop`, `pin_external_ids` (public-read, 002) | Pin & Pop **links and IDs** (facts, not images) on the trusted 182 | Public API | Not shown in the app UI, but readable through the public API. Counted by the SQL; your call whether to restrict them |

**Run `pin-and-pop-exposure-audit.sql`** (read-only, 6 SELECTs, tested on the migration replay) in production. Every `*_public` and `*_visible` count should be 0. Send me the results if any is not.

Side observation, not acted on: the collector pin page shows a **"Pinpics ID"** row when one is present (`app/pin/[id].tsx:313`). That may not suit, given PinPics declined.

---

## 1. Tracks and order

| Track | What | Why first |
|---|---|---|
| **Track 0: OE coverage (no app changes)** | WDW+DLR open-edition research pass in the research engine (2025–26 first), loaded into staging, then reviewed **with today's screen** | The primary objective. Today's per-pin direct check works for OE now |
| **Track 1: safety and rules** | S-1/S-2 (hide Pin & Pop), DB-1, API-1 to API-4 | Pin & Pop hiding is urgent. The rule changes unblock Low-confidence OE pins, which most news-sourced OE pins will be |
| **Track 2: review at scale** | API-5 to API-10, UI-1 to UI-5 | The new screens |
| **Track 3: preparation** | ENG-1 to ENG-4 | Fewer pins reach you, with better flags |

**Suggested sequence** (each row is about one agent cycle):

1. **S-1 + S-2**, **ENG-0** (OE pass, runs in parallel).
2. **DB-1**, **API-1**.
3. **API-2**, **API-3**.
4. **API-4**, **API-5**.
5. **UI-1**, **API-6**, **API-7**.
6. **UI-2**, **UI-3**.
7. **API-8**, **UI-4**.
8. **API-9**, **API-10**, **UI-5**.
9. ENG-1 to ENG-4 alongside, as research-engine sessions.

---

## 2. Work items

Each item:
- is one PR;
- can be tested on its own;
- keeps existing behaviour unless it says otherwise;
- uses the backlog labels from `docs/agents/OPERATING-MODEL.md`.

Sizes: **S** < ½ day, **M** ≈ 1 day.

### Safety (do first)

| ID | Change | Agent / autonomy | Tests (acceptance) | Size |
|---|---|---|---|---|
| **S-1** | `GET /api/admin/pending-pin-images` stops returning `pinAndPop` unless env `PIN_AND_POP_REFERENCES_ENABLED=true` (default off). No change to `getPinAndPopReferences` or the 042 data | `agent:backend` L2, security:required | Supertest: flag unset → `pinAndPop: null` on every item, and the repository method **is not called**; flag on → current behaviour | S |
| **S-2** | Contributed-images screen: when `pinAndPop` is null, show "Reference images hidden" and no Pin & Pop image or link. No request to pinandpop.com is possible | `agent:ui` L1 | jest-expo: no `Image` with a pinandpop URI and no `Linking.openURL` to pinandpop; before/after screenshot | S |

### Database (one additive migration)

| ID | Change | Agent / autonomy | Tests | Size |
|---|---|---|---|---|
| **DB-1** | Migration **046**, additive only. **(a)** `catalogue_review_events`: append-only audit log with `candidate_id`, `run_id`, `actor`, `action`, `from_status`, `to_status`, `fields text[]`, `market`, `source_url`, `source_class`, `payload jsonb` (e.g. `{from,to}` of a correction, a resolution, an added member), `notes`, `created_at`. RLS: admin read only. No insert, update or delete for API roles; writes only by service role. Revoke from anon/authenticated as in 045. **(b)** `catalogue_candidates` gets `review_lane text check (A,B,C,D)`, `suggestions jsonb default '[]'`, `live_match jsonb`, `added_by uuid` (reviewer-added pins), and an index on `(run_id, review_lane, status, research_key)`. Rollback SQL, `supabase/verify/046_verify.sql`, PGlite replay test | `agent:backend` **L3** (`approved` + `l3-go`), draft PR, **human applies to staging, then production** | PGlite replay: tables exist, RLS on, anon/auth cannot insert or update events, rollback runs clean, 045 verify still passes | M |

**Not in v2 (decision needed later): a per-market release table.**
- Live `pins` holds one `retail_price`, `currency` and `release_date`, plus `release_scope` text. `price_history` is GBP market value, not retail.
- Until you decide on a `pin_market_releases` table, regional values **stay in staging** (evidence and events, linked by `imported_pin_id`) and are never discarded.
- The import writes one confirmed market (§API-5).

### API and rules

| ID | Change | Agent / autonomy | Tests | Size |
|---|---|---|---|---|
| **API-1** | **Source registry** `lib/source-registry.ts`: host → `official` / `news` / `fan` / `lead_only` / `excluded`, with the registrable domain used for independence. Seed it from today's official-host list and the research policy (Pinventory, forums, Reddit, Meta, X, Threads, Fandom = `lead_only`; Pin & Pop, PinPics, PinTradingDB = `excluded`). `direct-check` uses it instead of "official or unclassified" | backend L2 | Unit: each class, subdomains, `www.`; excluded still 400; lead-only accepted as a note but `counts=false` | S |
| **API-2** | **Audit everything.** Every mutating research route writes a `catalogue_review_events` row: direct-check (per pin, set and page), decision (single, set), import, and every new route below. If the event write fails, the route returns 500 and says so | backend L2 (needs DB-1) | Supertest per route: one event with actor, action, from→to status, fields, source; a failed event insert → 500 | M |
| **API-3** | **Approval rule v2 (decision 1).** `checkDecision` approves Low/Unverified **only when** the identity fields were directly checked by a person on **one `official` source** or on **two `official`/`news` sources on different registrable domains**, neither `lead_only`. Engine evidence and search snippets never count; they are **leads**. Unresolved `conflict:` reasons still block. Medium and High are unchanged | backend L2 | Pure-function table tests: Low + 1 official ✓; Low + 2 news on different domains ✓; same domain twice ✗; news + lead_only ✗; snippets only ✗; conflict present ✗ | S |
| **API-4** | **Only confirmed facts are imported (decision 1).** `buildPinRow` writes a field only if a `human_direct_check` confirms it (or set-level confirmed fields for set members). Other fields become null and are listed in the batch notes, with `needs_*` flags where they exist. Identity is always required | backend L2 | Dry-run tests: an unconfirmed price → null and listed; a confirmed one → written; refuses without confirmed identity. #241's existing tests still pass | M |
| **API-5** | **Market-specific confirmation (decision 2).** Direct-check accepts per-field `market` (UK, EU, US, ASIA, AU, WDW, DLR, DLP) and the value seen. Batch approval of a pin with `variants:` warnings is allowed **only** when every variant field has a market-specific confirmation. The import writes the UK value if confirmed, else the confirmed market, plus `release_scope`; the other markets stay in staging | backend L2 | Variant pin without market ticks → skipped with reason; with them → approved; import picks UK; the other markets' evidence is untouched | M |
| **API-6** | **Correct a candidate.** `POST /candidates/:id/correct {field, to, sourceUrl, market?, note}`. It updates `proposed[field]`, writes an evidence row `{from,to}` (method `human_direct_check`) and an event. Correcting an identity field counts as an identity check from that source. Refused for imported or superseded candidates. Allowed fields are a fixed list | backend L2 | Old value kept in evidence and event; disallowed field → 400; excluded URL → 400; works on held and conflicted pins | M |
| **API-7** | **Resolve a flag.** `POST /candidates/:id/resolve {reason, resolution, otherId?, livePinId?, note}`. Resolutions: `different` (removes that one reason), `same_as_candidate` (marks one `superseded`), `same_as_live` (sets `duplicate_pin_id`, status `rejected`, note "already live"), `split` (structure: one pin is really two → uses API-8 to add the second), `not_sure` (→ `needs_more_research`). **Never approves.** Each writes an event | backend L2 | Each resolution's state change; the reason text is preserved in the event; a resolved hold can then pass `checkDecision`; a note is required | M |
| **API-8** | **Add a set member.** `POST /sets/:runId/:setKey/members {characters, name?, sourceUrl, overrides}`. Creates a candidate: same run, key `setKey/<slug>`, set fields inherited, `record_confidence='Unverified'`, `added_by`, status `researched`; an evidence row; an event. Refused if identified ≥ expected unless a note says the expected count is wrong | backend L2 (needs DB-1) | New candidate is unverified and appears in set counts; slug collision → 409; over-count without note → 400 | S |
| **API-9** | **Image rights for review.** Candidate detail and duplicate preview return images only from `pin_images` where `public_display_allowed` and `source <> 'pin_and_pop'`, with a source label (CTP shown as "licence evidence pending"). They never return a bare `pins.image_url` | backend L2 | A Pin & Pop row is never returned; a non-public row is never returned; a CTP row is labelled | S |
| **API-10** | **Paging and counts for thousands.** `GET /candidates` gets a cursor (`research_key`), `pageSize ≤ 100`, and filters `lane`, `line`, `standalone`, `status`, `q`. New `GET /sets` returns a page of sets with **expected / identified / missing / flagged / verified** computed in one place. The 1,000-row caps in the set and page routes are replaced by chunked reads | backend L2 (needs DB-1 for lane) | 3,000 synthetic candidates: pages are stable and complete with no duplicates; the counts match a brute-force recount; response < 500 ms on PGlite | M |

### UI (inside the existing Research Review screen)

All UI items:
- use the Storybook `home*` tokens and `components/ui/*`;
- add **jest-expo tests that nothing is ticked on first render**;
- include before/after screenshots at **iPad 1180×820** and **desktop 1440×900** (`pnpm --filter @workspace/pinhunt run screenshots`).

| ID | Change | Agent / autonomy | Tests | Size |
|---|---|---|---|---|
| **UI-1** | **Layout shell.** Replace the three stacked modals with segmented **Queue / OE & singles / Set Board**, a list or board, and a right-hand side panel. Below 900 px the panel becomes a sheet. Existing calls are reused; behaviour is unchanged | `agent:ui` L1 | Existing flows still work; selection survives switching tabs; screenshots | M |
| **UI-2** | **Source sheet.** "Open source" uses `expo-web-browser` (already a dependency) on iPad and a new tab on web. The review state is kept. On return, a field-tick bar (nothing pre-ticked, "Tick all shown" as an explicit button) calls direct-check with the **URL filled in**, and market chips when the pin has variants. Engine evidence is labelled "lead" until checked | ui L2 | No preselected chips; the URL comes from the opened link, never typed; a lead-only source shows "doesn't count" | M |
| **UI-3** | **OE & singles list.** Compact and detailed modes; filters (WDW+DLR, standalone, lane, years); cursor paging; Confirm (tick), **Edit**, **Skip** (an event, sent to the back). Batch "Verify N ticked" chains direct-check and decision per pin and shows the skipped reasons. Thumbnails only from API-9; otherwise a compact row with "See official photo ↗" | ui L2 (needs API-10) | A tick is possible only after a source was opened for that pin or its page; 1,000 rows scroll smoothly; skipped reasons shown | M |
| **UI-4** | **Set Board.** Set navigator (paged, `[`/`]`); header counts from `GET /sets`; tiles for known pins and dashed missing slots; "Select all on this page" button; set facts confirmed once; flags shown on tiles | ui L2 (needs API-10) | Counts equal the API; nothing ticked on load; held tiles can't be ticked until resolved | M |
| **UI-5** | **Edit, compare, add.** Edit sheet (API-6) shows the old value struck through and suggestions with their evidence (from `suggestions`); compare and resolve view (API-7) with differences highlighted; add-member sheet (API-8). Keyboard shortcuts on web | ui L2 (needs API-6/7/8) | The three workflows end to end against a supertest-backed mock; every action produces the expected API call | M |

### Research engine (preparation; never approves)

These run in the research engine (Python, `research/catalogue-engine`) in interactive sessions. Basil stays inactive. Output goes into the existing staging payload, plus `review_lane`, `suggestions` and `live_match` once DB-1 exists.

| ID | Change | Tests | Size |
|---|---|---|---|
| **ENG-0** | **WDW + DLR open-edition research pass** (2025–26, then 2023–24): weekly roundups and OE posts as leads, product numbers where stated, standalone pins kept standalone. Needs your one-minute terms and robots check of Disney Pins Blog, WDWNT and Laughing Place first | Golden-file tests on 20 known OE pins; no excluded or lead-only source counted | M–L |
| **ENG-1** | **Live match** against the QUERY 1 export (CTP and all live pins): product number or external ID, then title + character + year, then set + character → `duplicate_status` and `live_match` | Precision and recall on a hand-labelled 100-pin sample | M |
| **ENG-2** | **Tiering and lanes** with the same registry as API-1 (shared JSON file) → `review_lane` | Lane counts reproduce PROPOSAL §3 on the current payload | S |
| **ENG-3** | **Consistency suggestions** (rules): duplicated names, expected vs identified, price and currency by market, one pin or two → `suggestions[] {field, from, to, reason, evidence_ids}` | Fixture cases, including "627; Experiment 627" | S |
| **ENG-4** | **LLM suggestions over held data only** (no page fetching), via the API server's existing OpenAI integration. Acceptance rate logged from events | Off by default; cost cap; suggestions never touch `proposed` | M |

---

## 3. How the rules hold

| Requirement | Enforced by |
|---|---|
| Never preselect or auto-approve | UI tests (nothing ticked on load); server: approval needs a `human_direct_check` by the same request's actor or earlier (API-3); batch routes re-check every pin |
| Held duplicates and conflicts can be fixed | API-6 correct, API-7 resolve, API-8 add (for "really two pins") |
| Audit trail of every decision | DB-1 append-only events + API-2 on every route; evidence rows keep from→to |
| Only facts supported by evidence | API-3 (approval) + API-4 (import writes confirmed fields only) |
| Regional values preserved | API-5; staging keeps every market; the `pin_market_releases` decision comes later |
| Images only with confirmed rights; Pin & Pop hidden | S-1, S-2, API-9; the 042 constraint stays |
| Thousands of records | API-10 paging and counts, lanes, UI-3/UI-4 paging |
| Source links are leads until checked | API-1/API-3: only `human_direct_check` counts; UI-2 labels engine evidence "lead" |
| Inside Research Review; reuse | UI-1 to UI-5 replace the modals in the same screen; all 045 routes and rules reused |
| Desktop and iPad | Breakpoints in UI-1; screenshots at both sizes on every UI PR |

---

## 4. Risks and open points

- **DB-1 is L3.** It needs your `approved` + `l3-go` labels and your manual apply to staging, then production. Everything that writes events or lanes waits for it. S-1, S-2, API-1 and API-3 do not.
- **API-4 changes #241's behaviour** (fewer fields imported). Intentional, per your decision 1.
- **Lead-only and source classes are policy.** The registry (API-1) is one reviewed file, and changing it is a PR.
- **Expected effort** (est.): Track 1 ≈ 3–4 agent days, Track 2 ≈ 7–9, Track 3 ≈ 3–5 engine sessions. ENG-0 runs alongside from day 1.
- **Nothing here touches** Pin & Pop, PinPics or Stewpins, scraping, or public image display rights.

**When you're happy with this plan,** tell me which items to turn into backlog issues. I'll draft them in the `backlog-item.yml` format for you to label. Nothing is created until you say so.

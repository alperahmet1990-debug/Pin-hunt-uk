# PinHunt UK end-to-end UX review (November 2026)

Review of the 14 collector journeys agreed with the maintainer on 22 Nov 2026 (admin screens excluded), plus an investigation of a "Check price" button that uses Soldgraph and the eBay API. The output is GitHub issues, all size S, that the dev routine can pick up once they're labelled and approved.

- **Issues filed:** #667–#706 (40 agent-sized issues), #707 (human switch-on checklist), #708 (decisions needed). Index: #709.
- **Method:** a code walk of every journey (`artifacts/pinhunt`, plus `lib/pin-repository`, `api-server` and migrations where a journey depends on them), and 79 demo-mode screenshots (Expo web export, 390×844, light). Every finding cites `file:line` with an evidence label: CODE (read in code), VISUAL (seen in a screenshot) or INFERRED (reasoned, not verified).
- **Not done:** no device testing, no signed-in Supabase session (demo mode only), and no admin screens. Native-only behaviour (camera, pickers, push) was reviewed in code only. Demo mode has no pin photos, so "Image needed" tiles were ignored.
- **Security:** one concern behind a feature flag that is off was found. It is not described here (public repository) and was passed to the maintainer privately.

---

## 1. Why the agents stopped picking up work

The `pinhunt-dev` routine is enabled and runs hourly, but Agent ops reports **"No eligible issues"** (#90). Eligibility (OPERATING-MODEL §4.1) needs `approved` plus `autonomy:L1|L2`, `size:S`, an `agent:` label, no hold, and closed blockers. Every approved issue failed at least one of these:

| Approved issue | Why it's not eligible |
|---|---|
| #22 | Blocked by #21 (human-only: write and host the privacy policy) |
| #32, #35, #73 | `size:M` |
| #11, #34, #36, #37, #38, #40, #55, #147 | L3, or `interactive` |
| #263, #385, #410, #411, #434, #438, #643 | Approved, but missing autonomy, agent and size labels (agent-proposed items approved without triage) |
| #322 | `on-hold` |

**To restart the queue:**
1. Label the new issues. `docs/ux-review/apply-suggested-labels.sh` adds the suggested labels in one go (run it from your own machine; agents can't add priority, autonomy or gate labels). `APPROVE=1` also adds `approved` to the L1/L2 ones.
2. Or approve a handful by hand from the GitHub app. The best starting set is in §4.
3. Agent ops re-ranks on every label change and gives `status:ready` to exactly one issue. The next hourly dev run takes it.
4. Optional: give #643 and #263 the missing labels too (both are already approved).

The WIP limit is 2 open `claude/*` PRs. #639 is open with failing checks, so one slot is in use until it's merged or closed.

---

## 2. Summary of findings

| Journey | Blocker | Major | Minor/Polish | Issues filed |
|---|---|---|---|---|
| 1 First run and onboarding | – | 2 | 9 | #685, #688 |
| 2 Scan to identify | – | 2 | 8 | #669, #672, #670 |
| 3 Catalogue and search | – | 3 | 9 | #671, #673, #674 |
| 4 Manage collection | 1 | 2 | 10 | #667, #668, #675, #684 |
| 5 Value a pin | – | 3 | 9 | #702, #703, #704, PRICE #705–#707 |
| 6 Find a trade partner | – | 2 | 13 | #678, #679 |
| 7 Run a trade | – | 4 | 7 | #676, #680, #681, #682, #677 |
| 8 Sell listing (flag off) | – | 2 | 5 | decision #708 |
| 9 Community feed and posts | – | 5 | 5 | #689, #691, #694, #692 |
| 10 Messaging | – | 5 | 5 | #693, #695, #696, #698 |
| 11 Events and places | – | 1 | 6 | #697 |
| 12 Contribute | – | 3 | 8 | #699, #700, #701 |
| 13 Profile and settings | – | 3 | 6 | #683, #686, #690 |
| 14 Delete account | – | 1 | 4 | #687, #685 |

**What's strong:**
- ISO (`wanted`) and For Trade (`for_trade`) stay distinct everywhere.
- Undo is consistent and snapshot-based in the collection.
- Confirmations in the collection flows are in-app, so they work on web.
- The scan flow is honest about confidence and handles every waiting and error state.
- Sets get real progress, "Find the N missing" and "Add missing to ISO".
- No screen handles money between collectors, and the trade guide says each collector posts their own pins and pays their own postage.
- Delete account meets App Store 5.1.1(v).

**Themes across journeys:**
1. **Failure looks like "nothing there".** Network or database errors show as "Not in our catalogue yet" (scan), "Set not found", "Pin not found", "No collectors found" or "No events coming up". Collectors then make wrong choices, such as duplicate pin submissions. (#669, #674, #667, #681, #696)
2. **`Alert` callbacks still guard important actions** that do nothing on web: deleting and reporting posts, the avatar menu, trade errors, and draft deletion. The in-app `ConfirmDialog` and `UserSafetySheet` already exist. (#689, #691, #690, #681)
3. **Dead-end empty states** at the moments that matter most at launch: Find a Trade with no traders, My Trades, and a rejected submission. (#678, #677)
4. **Identity is missing in trading and messaging.** The trade screen never names the other collector, and there's no route from a post, comment or chat to their profile (and so to Block). (#676, #694, #698)
5. **Valuation trust.** Up to four different prices on one page, two unsynced UK/US switches, no dates. (#702, #703, #704, PRICE issues)
6. **Profile edits that don't save.** Clearing a field or removing the photo silently does nothing, and signing out loses unsynced changes. (#683, #686, #684)

---

## 3. Journeys in priority order (2 → 4 → 7 → 1 → 3 → 6 → 5, then 8–14)

### Journey 2: Identify a pin by scanning
**Path:** Home "Find a pin" / Scan tab → AI consent → capture → identify (35 s client timeout) → "Is this your pin?" → That's it (QuickAddSheet: Owned / ISO / For Trade) or Not it → alternatives → recovery (search, browse set, retake, add pin).
**Works well:** one-tap scan, consent before upload, complete camera-permission states, offline vs server-down messages, low-confidence "Is it one of these?", Undo on every add, "Scan next pin" with a running count.

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J2-01 | Major | A failed pin lookup after a successful identify shows "Not in our catalogue yet" with "Add this pin", which encourages duplicate submissions (`scan.tsx:332-354`) | #669 |
| J2-05 | Major | A pin added from a scan never reaches the collection, and the confirmation has no link to My Submissions | #708 (decision) |
| J2-02/03 | Minor | Two identical primary retry buttons after a failure; no way to search after declining AI consent | #672 |
| J2-04 | Minor | The result doesn't show that the pin is already Owned, on the ISO or For Trade | #670 |
| J2-06–10 | Minor/Polish | Raw server error on a failed submission, duplicate reset controls, web copy, mixed "Scan/Find/Search" wording, stepper a11y | not filed (§5) |

### Journey 4: Manage collection
**Path:** Collection (Boards / Sets / For Trade / ISO) → + sheet (scan, add from catalogue, new board) → Browse in add mode → bulk select → boards. Pin detail → Manage Collection. Home tiles deep-link into tabs. (Home "Continue Collecting" was removed in #604, so CLAUDE.md is out of date.)
**Works well:** ISO and For Trade are clearly separated, with a "What's ISO?" explainer. Undo works for every change. Bulk actions confirm in-app. Set totals come from server summaries.

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J4-01 | **Blocker** | `app/pin/[id].tsx` calls `useMemo` (line 166) after an early return (line 128). A pin that has to be fetched can crash with "Rendered more hooks…". Verified in code, not reproduced on a device. | #667 |
| J4-03 | Major | Pin detail's "More from this set n/N" is counted from a partial cache and can show a false "complete" | #668 |
| J4-02 | Major | Home tiles can land on the wrong Collection tab on a repeat tap | #675 |
| J13-03 | Major | Sign Out silently discards unsynced collection changes | #684 |
| J4-04–10 | Minor/Polish | ISO toggle has no Undo; the board's empty state uses the wrong route; board/QuickAddSheet a11y; board-add has no Undo; board counts include removed pins | not filed (§5) |
| J4-11/12/13 | – | Single-pin sets, spare copies, "who wants it" | existing #30, #133, #145 |

### Journey 7: Run a trade end to end
**Path:** chat → Propose Trade → pick pins → trade screen (pending → accepted → posted → received → completed, or problem) → rating → "Update your collection?" sheet. My Trades lists them.
**Works well:** the server is the source of truth for state changes. Accept-what-you-saw (`itemsVersion`) stops pins being switched after you've seen them. Cancel and Received are confirmed in-app. There's a clear timeline. No payments; each collector pays their own postage.

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J7-01 | Major | The trade screen never says who the trade is with ("They proposed…", title always "Trade Request") | #676 |
| J7-02 | Major | Decline is one tap and irreversible, while Cancel and Received are confirmed | #680 |
| J7-04 | Major | My Trades doesn't show which trades need you; status words differ across three screens; bare empty state (VISUAL) | #677 |
| J7-03 | Major | The collection update after a trade can be applied twice (the flag is stored on the device only) | #708 (decision) |
| J7-06/07/08 | Minor | Trade errors invisible on web (`Alert`), no retry on load error, "Rate this Trade" comes back | #681 |
| J7-09 | Minor | The guide doesn't mention Report a Problem and isn't linked from the trade screen | #682 |
| J7-10 | Minor | Promised pins stay publicly For Trade | #708 (decision) |
| J7-05, J7-11 | – | Actions cut off on small screens; completion notifications | existing #499, #34/#110 |

### Journey 1: First run and onboarding
**Path:** login → register (email, password, DOB, 18+) → check your email → confirm link → complete profile (username, region, home market) → Home with zero pins → "Already collecting?" sheet. Forgot/update password.
**Works well:** a careful age gate (DOB never leaves the device). Sign out is offered on every onboarding step. Auth errors are mapped to friendly text that doesn't reveal whether an account exists. The zero-pins Home has one clear next step (VISUAL).

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J1-01 | Major | No way to resend the confirmation email, so "Please confirm your email" is a dead end | #688 (suggested L3) |
| J1-02 | Major | "Contact PinHunt support" is promised, but no support address exists anywhere | #685 (+ human: #21/#87) |
| J1-03–11 | Minor/Polish | Blank screen while AuthGuard loads, no feedback after confirm or password update, false username "available" for private profiles (needs a migration), auth-form a11y, "ISO" jargon on Home, password copy says 6 vs 8, stat-tile truncation at 320 | not filed (§5) |

### Journey 3: Discover via catalogue and search
**Path:** Search (recent, "Popular", debounced server search, infinite scroll) → Browse Catalogue (set-grouped, filters, select-all per set) → Set detail (progress, Owned/Missing, Find the N missing, Add missing to ISO) → Pin detail.
**Works well:** search handles every state. Browse is fast at catalogue scale. The set page treats sets as first-class objects.

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J3-01 | Major | Browse groups by set, but set headers don't open the set page | #671 |
| J3-02 | Major | Search never returns a set, only its pins | #673 |
| J3-03 | Major | A set that fails to load says "Set not found" with no Retry | #674 |
| J3-04 | Minor | Pin detail flashes "Pin not found." before loading (fixed with #667) | #667 |
| J3-05–12 | Minor/Polish | Edition size shows "Open Edition" when unknown; set name isn't a link; ISO toggle has no Undo; "Popular Pins" isn't popular; per-page ranking; set-complete colour should be plum; a11y on the demo-only catalogue | not filed (§5) |
| J3-10 | – | Raw database errors and timeouts in Browse | existing #642, #643 |

### Journey 6: Find a trade partner
**Path:** Pin detail → Find a Trade (`traders/[pinId]`), Find Trades (ISO matches, potential trades, sets), Find the missing (set traders), Find Collectors, collector profile. Nearby is behind a flag that is off.
**Works well:** one primary action per trader card. Blocked collectors are filtered everywhere. Set-level "who has my missing pins" in one call. Nearby shows distance bands only.

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J6-01 | Major | Find a Trade's empty state is a dead end (the most common state at launch) | #678 |
| J6-02 | Major | 4–5 screens from "someone has it" to a proposal | existing #141, #32 |
| J6-07/08 | Minor | Find Trades has no pull-to-refresh, and one failing trader breaks the page | #679 |
| J6-03–15 | Minor | Raw errors, Find Collectors hides failures and lets stale results win, top padding, card a11y, copy when everything is already on the ISO, layout jump on the profile, mixed header styles, Nearby readiness | not filed (§5) |

### Journey 5: Value a pin
**Path:** Pin detail → "Recent sold prices" card (Soldgraph, "Get a price"; off in production) + "Value" card (eBay UK asking price, community price, catalogue estimate, your price) → Price my trade pins, Community prices setting.
**Works well:** sources are honest ("sold" vs "asking", never converted). "Get a price" is built for trust, with caps, caching and plain-language limits. Community prices show evidence and never names.

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J5-01 | Major | "Fair £25 · 7 sales" sits directly above "No market price yet", next to £14 community and £18 estimate (VISUAL) | #702 (interim), PRICE #706 |
| J5-02 | Major | Two "UK £ / US $" switches on one page that don't stay in sync (VISUAL) | #703 |
| J5-03 | Major | No dates on sold or asking prices | #704 |
| J5-04/06 | Minor | "No sales" names a market that wasn't searched; "Get a price" silently resets after 3 minutes | #703, #704 |
| J5-05, 07–10 | Minor/Polish | Loading looks like "no price"; the legacy card headlines an unsourced estimate; misleading states in Price my trade pins and the Community prices setting | not filed (§5) |

### Journey 8: Sell listing (`FEATURES.marketplaceListings` is off)
PinHunt only stores an outbound link, so this is consistent with the no-payments rule. Before turning the flag on: listing is only possible for For Trade pins (this blurs trade-only and selling), drafts can never be published, confirmations use `Alert`, "1,50" is saved as 150, and there is a link-safety point (held privately). → #708 item 3.

### Journey 9: Community feed and posts
| ID | Sev | Finding | Issue |
|---|---|---|---|
| J9-01 | Major | Report and delete on posts and comments use `Alert` callbacks, which do nothing on web | #689, #691 |
| J9-02 | Major | No route from a post or comment to the author's profile (and so to Block) | #694 |
| J9-03 | Major | Feed capped at 40 posts with no "load more" | #692 |
| J9-04 | Major | Trade details on a post can't be edited, and stay after a type change | not filed: touches `lib/pin-repository` types and is M-sized. File after #692 |
| J9-06–10 | Minor/Polish | No discard prompt, raw errors, icon a11y and small targets, naming, Post opens on the wrong type | not filed (§5); naming → #708 |

### Journey 10: Messaging
| ID | Sev | Finding | Issue |
|---|---|---|---|
| J10-01 | Major | Messages list goes stale after reading a chat | #693 |
| J10-03 | Major | Unread badge stuck for conversations with blocked collectors | #695 |
| J10-04 | Major | One failed background refresh replaces the whole chat with an error | #696 |
| J10-05 | Major | Report/Block is only reachable by long-pressing their message | #698 |
| J10-02 | Major | A new thread is created on every "Message" tap | existing #61 |
| J10-06–10 | Minor/Polish | Sharing clears typed text (#696); "From post" banner not tappable (#698); retry creates an empty thread (#61); row a11y; badge colours | partly filed |

### Journey 11: Events and places
| ID | Sev | Finding | Issue |
|---|---|---|---|
| J11-01 | Major | Undated community Event posts are listed before real upcoming events on Home and never expire | #697 |
| J11-02–07 | Minor/Polish | Rows without a link pretend to be links, no error state on Events, Places has no loading or error states, "Sign in" copy shown to signed-in users, place delete has no error handling, naming | not filed (§5) |

### Journey 12: Contribute
| ID | Sev | Finding | Issue |
|---|---|---|---|
| J12-01 | Major | My Submissions clears "NEW" before it renders | #699 |
| J12-02 | Major | Edit submission requires Brand (Add Pin doesn't), which blocks resubmitting | #700 |
| J12-03 | Major | A replacement photo skips the rights confirmation | #701 (+ #708 item 7) |
| J12-04–11 | Minor/Polish | Draft delete via `Alert`, rejected submission is a dead end, duplicate detail screen after save, camera-only photo contribution, unsafe JSON parsing, no discard prompt, a11y, naming | not filed (§5) |

### Journey 13: Profile and settings
| ID | Sev | Finding | Issue |
|---|---|---|---|
| J13-01 | Major | Clearing Bio, Region, Town, County or Country doesn't clear it (also a privacy problem) | #683 |
| J13-02 | Major | "Remove Photo" doesn't remove the photo | #686 |
| J13-03 | Major | Sign Out loses unsynced collection changes | #684 |
| J13-04 | Minor (Major on web) | Avatar menu and upload don't work on web | #690 |
| J13-05–09 | Minor/Polish | No unsaved-changes guard, Community prices error copy, two "Account" sections, "v0.1" footer vs 1.0.0, web export, no profile-load error | not filed (§5) |

### Journey 14: Delete account
Easy to find, in-app confirmation (works on web), honest consequences, open-trade guard. Meets App Store 5.1.1(v).

| ID | Sev | Finding | Issue |
|---|---|---|---|
| J14-01 | Major | An expired session (401) is handled exactly like a successful deletion | #687 (suggested L3; maintainer to confirm the intent) |
| J14-02–05 | Minor/Polish | No "deleted" confirmation (#687), unfulfilled support promise (#685), case-sensitive DELETE, no "Keep my account" button | partly filed |

---

## 4. Suggested approval order

The dev routine takes one issue an hour, ranked by priority, then by number of dependents, then by issue number. A good first batch (P1, L1/L2, no blockers, and they don't touch the same files):

1. #667 Pin detail hook-order crash
2. #683 Edit Profile clearing fields (then #686 and #690 follow automatically once approved)
3. #669 Scan lookup error
4. #671 Browse set headers open the set
5. #676 Trade with @name (then #680 → #681 → #682)
6. #689 Post delete confirmation (then #691 → #694)
7. #693 Messages list refresh (then #695)
8. #697 Home Events ordering
9. #702 Value card "Asking price" interim fix
10. #705 Live eBay refresh API (backend, needs `security:required` review)

The chains are expressed in each issue's **Blocked by**, so approving a whole chain at once is safe: Agent ops releases each issue when the one before it closes. L3 items (#687, #688) need `l3-go` and are done interactively.

---

## 5. Findings not filed (backlog candidates, P3)

These are real but small, so they were left out to keep the queue focused. Each has full detail and a proposed issue in the reviewer notes. File them when the P1/P2 batch is through:

- **Scan:** raw error on a failed add-pin submit (J2-06); copy and duplicate-control polish (J2-07–09); stepper a11y (J2-10).
- **Catalogue:** edition-size label (J3-05); set-name link on the pin page (J3-06); Undo on the pin-page ISO toggle (J3-07 / J4-04); "Popular Pins" naming (J3-08); plum set-complete colour (J3-11).
- **Collection:** board empty-state route and a11y (J4-05/06); QuickAddSheet radio semantics (J4-07); Undo for board-add from the catalogue and board counts (J4-08/09).
- **Value:** loading vs error vs "no price" (J5-05); demote the unsourced estimate (J5-07/08); Price my trade pins states (J5-09); Community prices load and save errors (J5-10 / J13-06).
- **Trading:** friendly errors on Find a Trade and set traders (J6-03); Find Collectors errors and stale results (J6-04); card a11y (J6-06); "+N" and copy on Find the missing (J6-09/10); profile layout jump (J6-11); one rating badge (J6-12, #143).
- **Onboarding:** AuthGuard loading view (J1-03, auth-adjacent); feedback after confirm and reset (J1-04/05, L3); auth-form a11y (J1-07); Home "ISO" a11y and avatar target (J1-08); Complete Profile polish (J1-09); password copy (J1-10).
- **Community and messaging:** discard prompts on post forms (J9-06); friendly errors (J9-07); icon a11y (J9-08); Post opens on the active chip (J9-10); conversation row a11y (J10-09); one unread badge style (J10-10).
- **Events and places:** link-less rows (J11-02); Events error state (J11-03); Places loading and error states and copy (J11-04/05); place delete errors (J11-06).
- **Contribute:** draft delete confirmation (J12-04); next step for rejected submissions (J12-05); Back after an edit (J12-06); choose from library on phones (J12-07); safe JSON parsing (J12-08); discard prompts (J12-09); a11y (J12-10).
- **Profile and delete:** unsaved-changes guard (J13-05); Profile tidy-up (J13-07/09); web export (J13-08); DELETE case and "Keep my account" (J14-04/05).
- **Community edit (J9-04):** edit trade details on a post (lib types + edit form, size M).

---

## 6. "Check price": sold prices plus live listings (Soldgraph + eBay)

**Short answer: yes, and most of it is already built.** Sold prices come from Soldgraph (eBay UK/US sold). Live listings have to come from our own eBay Browse API key, because Soldgraph has no live eBay data (it has sold eBay data and live Vinted/Whatnot). The two providers must stay separate anyway (`docs/market-data/RIGHTS.md` §4). What's missing is a small backend control (#705), one button (#706), and turning the switches on (#707).

### What exists today (verified in code)

| Piece | Where | State in production |
|---|---|---|
| **"Get a price"** (sold) | `components/SoldPriceCard.tsx`, `hooks/useSoldPrices.ts` → `POST/GET /api/pins/:pinId/price-request` → `services/market/price-request/*` (migration 079). A paid Soldgraph search for one pin returns Low / Fair / High from N eBay UK/US sales. It's capped at 5 per user and 50 in total per day, has a 30-day cache including "no sales", and a hard monthly budget. | **Off.** Needs `MARKET_PRICE_REQUEST_ENABLED`, `MARKET_VALUATION_V2_ENABLED`, `SOLDGRAPH_ENABLED` and its key, a published market, and a budget row. |
| **Live eBay asking prices (v1)** | `components/MarketValueSection.tsx` ← `GET /api/pins/:pinId/market-value` (`services/ebay.ts`, `services/valuation.ts`). "Typical UK price" plus up to 5 live UK listings with "View on eBay". Labelled "not sold prices". | Live wherever the eBay production keyset is active. Read-only in the app: `POST …/market-value/refresh` exists but **nothing calls it** (by design in B-P1-19), and its only guard is a 60-second per-pin cooldown. |
| **Individual sold listings** | `GET /api/pins/:pinId/market-comps` | **Off** (`MARKET_COMPS_PUBLIC_ENABLED`). Blocked by LAUNCH-BLOCKERS **L1**: eBay's own terms, which Soldgraph can't grant. |
| **Agreed design** | #410, maintainer's "Option D" (19 Oct): one market switch, fair value + range + confidence, "Recent sold prices" list behind its own flag, "Asking now" block | Not built. `SoldPriceCard` is an early subset of it. |

### Recommendation
- **One button, "Check price"**, in the price area, with the label for the maintainer to confirm (#708 item 5). One tap:
  - refreshes live eBay prices (#705 makes this safe: flag, 24-hour freshness cache, 20 eBay calls per user per day);
  - when sold requests are open, also starts the Soldgraph sold search.
- The page then shows **sold** (Low / Fair / High, "Based on N sales on eBay UK", checked date) and **on sale now** (asking range + up to 5 live listings with links), in separate, labelled places. Never one blended number.
- **Ship live first.** Live eBay prices need no Soldgraph credits and no pilot. Sold prices follow once the UK pilot (#411) passes.
- Individual sold rows wait for L1. They are already designed in #410.

### Issues
- **#705** PRICE-01 (backend, L2): safe user-triggered live refresh.
- **#706** PRICE-02 (UI, L2): the single "Check price" button; hides the duplicate "Get a price". Blocked by #705 and #704.
- **#707** PRICE-03 (human): switch-on checklist (eBay keyset → live flag → migrations 054/055/079 → probe → UK pilot → publish UK + hard-stop budget → device check → production).
- Interim trust fixes on the same screen: **#702**, **#703**, **#704**.

---

## 7. Notes for the maintainer

- **CLAUDE.md is out of date** on Home (no "Continue Collecting", "For You" or "What's Happening" since #604) and on the Collection tabs (Boards / Sets / For Trade / ISO). Suggest folding this into #72.
- **Demo mode can't show the J4-01 crash** because it caches the whole catalogue. Please do a device check after #667.
- `/sell/*` and `/nearby` correctly redirect while their flags are off.

---

## 8. Follow-up (28 Nov): filters for adding pins from the catalogue

Browse / Add from catalogue has search plus four filters: Hide pins I have, Set, Year and Edition, each single-choice. It has no "where it's from" filter and no sort.

**Field check.** The only catalogue data in the repo is the 16 Oct research baseline (2,978 public non-seed pins). In it:
- `pins.origin` (Master Catalogue "Park / Retailer") is "shared" on 44% of pins, and only 30 pins (1%) are Disneyland Paris.
- Edition is stated on 99%, release year on 99%, and characters and set on almost all pins.

The catalogue is now about 116k pins, so #752 asks the maintainer to run three read-only coverage queries before the park filter is built.

| Issue | What | Level |
|---|---|---|
| #752 | Measure filter-field coverage (read-only SQL) | human |
| #753 | Browse query: filter by origin group | L2 backend, after #752 |
| #754 | "From" chip (Disneyland Paris, Disney Store, WDW…) | L2 UI, after #753 |
| #755 | Fixed, labelled Edition list (options no longer change as you scroll) | L1 UI |
| #756 | Filter chips wrap instead of hiding off-screen | L1 UI |
| #757 | Index for newest-first ordering | L3 migration |
| #758 | Sort: Newest first / Set A–Z | L2 UI, after #757 |

Not filed: a character filter (search already matches characters, and a pick-list needs a new RPC), multi-select filters, and "most owned / most wanted" sorts (these need data across users).

# Launch blockers (as of 21 Oct 2026)

This snapshot sorts the open items into three groups, kept deliberately separate:
1. permissions now **confirmed** (not blockers);
2. **legal or rights uncertainty**;
3. **technical defects or unfinished work**.

Priorities come from the issue labels. "Human" means only the maintainer can do it. Update this file when an item moves.

## 1. Confirmed permissions (not blockers)

| Item | Basis |
|---|---|
| Soldgraph data: public display of individual sold listings, prices, dates and links | Soldgraph written confirmation, 21 Oct 2026 (`docs/market-data/RIGHTS.md` §1) |
| Publishing our own valuations, ranges, confidence scores and comparable-sale counts | Same |
| Keeping Soldgraph historical sale records with no time limit | Same |
| Soldgraph attribution | Optional |

## 2. Legal or rights uncertainty

| # | Item | What it blocks | Owner |
|---|---|---|---|
| L1 | **Marketplace terms** (eBay, Vinted, Whatnot) for publicly showing individual listings and links obtained through Soldgraph. Soldgraph cannot grant these. | Only the public comparable-listings view (`MARKET_COMPS_PUBLIC_ENABLED`). Our own derived valuations are **not** blocked by this. | Human |
| L2 | **eBay API License Agreement** review for our own eBay Browse API data: the v1 estimates and the `ebay_browse:*` source. Covers display and retention. | Changing how long or how publicly that data is used. Today's behaviour is unchanged. | Human |
| L3 | **Privacy policy and terms of use** written and hosted: [#21](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/21), P0 | App Store submission; also blocks [#22](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/22), the in-app links | Human |
| L4 | **Collectible PinTrader rights evidence**: [#23](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/23), P0 | Public use of that catalogue data and imagery | Human |
| L5 | **Pin & Pop written terms**: epic [#431](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/431) | Only the Pin & Pop integration. Not a launch blocker while no Pin & Pop data is shown publicly. | Human, with Pin & Pop |

## 3. Technical defects or unfinished work

### Valuation (market data)

| # | Item | Status | Blocks |
|---|---|---|---|
| T1 | **UK/France duplicate listings and currency conversion**: [#411](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/411) | Fix merged (#451). Still to do: apply migration 054 to staging, run a 1-credit probe, re-run the UK pilot, verify the FR evidence. | Publishing **any** regional valuation |
| T2 | **Valuation API, history and retention**: [#446](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/446) | In progress. Draft PR with migration 055. | Valuation screen data, no age-based deletion, comps flag |
| T3 | **App valuation screen**: [#410](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/410) | Approved; after #446 | Showing v2 values in the app |
| T4 | Production keeps `MARKET_VALUATION_V2_ENABLED` and `MARKET_COMPS_PUBLIC_ENABLED` **off**, and the market allow-list empty | Restriction, not a defect | Lifted market by market once T1 is cleared (and L1 for comps) |

### App Store and compliance (P0)

| # | Item | Status |
|---|---|---|
| T5 | Account deletion UI: [#14](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/14) / PR [#453](https://github.com/alperahmet1990-debug/Pin-hunt-uk/pull/453) | QA and security passed; waiting for merge. Server and migration 051 are live. |
| T6 | Privacy and terms links in the app and at sign-up: [#22](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/22) | Approved; needs L3 (the hosted URLs) |
| T7 | Password reset: [#15](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/15) (app) and [#176](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/176) (Supabase configuration, human) | Open |
| T8 | Profile data access hardening: [#10](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/10) | Open, L3 |
| T9 | Remove demo data from production: [#18](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/18) | Open, human |
| T10 | Release configuration (EAS profiles, identifiers, permission strings): [#20](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/20) | Open, L3 |

Block and report users (#16, #17) is done: migration 050 is live, and the app UI is merged.

### Infrastructure, security and quality

| # | Item | Priority | Status |
|---|---|---|---|
| T11 | Staging Supabase project: [#8](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/8) | P0, human | Open. Every migration is currently applied straight to production. |
| T12 | Backups: production is on the Supabase Free plan with **no backups**. [#54](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/54) | P1, human | Open |
| T13 | Admin account review and MFA: [#51](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/51) | P1, human | Open |
| T14 | API usage limits and request hardening: [#36](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/36) | P1 | Open |
| T15 | Storage bucket hardening: [#38](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/38) | P1 | Open |
| T16 | Crash reporting and uptime monitoring: [#37](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/37) | P1 | Open |
| T17 | Migration baseline: [#9](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/9). The offline replay of the migration chain fails at `006_trade_ratings.sql` (duplicate policy), so the live schema may have drifted. | P1 | Open |
| T18 | Regression matrix ([#83](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/83), P0), device matrix ([#85](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/85)), scan protocol ([#84](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/84)), closed beta ([#86](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/86)), release checklist ([#87](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/87)) | P0/P1, human | Open |

## Housekeeping (not blockers)

- [#12](https://github.com/alperahmet1990-debug/Pin-hunt-uk/issues/12): the API is already live on Render over HTTPS. Close it, or narrow it to the Dockerfile.
- Migrations 052 (review audit log) and 053 (Pin & Pop ID storage) are merged but not applied. Neither is needed for launch.

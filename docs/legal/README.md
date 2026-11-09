# PinHunt Ltd: legal documents and launch checklist

PinHunt Ltd was incorporated on 9 November 2026 (company number **17570164**, England and Wales).

- `privacy.md` and `terms.md` are the **web copies** of the Privacy Policy and Terms of Use.
- The source is `artifacts/pinhunt/utils/legal.ts`, which the app shows at `/legal/privacy` and `/legal/terms`. Don't edit the Markdown by hand. Change `legal.ts`, then run `UPDATE_LEGAL_DOCS=1 pnpm exec jest legalDocs` in `artifacts/pinhunt`. The test fails if the two drift apart.

> **Status: draft.** Written from what the code does (evidence below), not legal advice. Have a solicitor, or a reputable UK template service, review both documents before you publish them or submit to the App Store.

## Things only the company can do

| # | Step | Why | Where |
|---|---|---|---|
| 1 | Fill in `contactEmail` and `icoRegistration` in `utils/legal.ts`, then regenerate the Markdown. (`registeredOffice` is set: 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ.) | The app shows "Draft" and "[to be confirmed]" until these are set. | `artifacts/pinhunt/utils/legal.ts` |
| 2 | Pay the ICO data protection fee (most likely tier 1, about £52 a year) and add the registration number. | A UK company processing personal data must register unless exempt. PinHunt isn't exempt: it holds accounts, messages and approximate locations. | ico.org.uk/for-organisations/data-protection-fee |
| 3 | Set up the contact mailbox (e.g. privacy@ on your domain). Also set `SUPPORT_EMAIL` in `constants/appConfig.ts`, which turns on "Send Feedback". | Privacy requests must be answered within one month. | |
| 4 | Have the documents reviewed (see the open questions below). | Liability wording, children's use and international transfers need a professional eye. | |
| 5 | Publish `privacy.md` and `terms.md` at public URLs, e.g. pinhunt.co.uk/privacy. | App Store Connect and Google Play require a privacy policy URL. The in-app pages need sign-in only for the rest of the app; the legal pages are open to everyone. | Your website |
| 6 | Get a D-U-N-S number for PinHunt Ltd (free from Dun & Bradstreet; allow up to 2 weeks). | Apple needs it to enrol an organisation. | developer.apple.com/enroll/duns-lookup |
| 7 | Move the Apple Developer account from individual to organisation (PinHunt Ltd). Do the same for Google Play if used. | The store listing then shows PinHunt Ltd as the seller. | Apple Developer support: "migrate to organisation" |
| 8 | Fill in App Store "App Privacy" (nutrition labels) from the table below, and add the privacy policy URL. | Required for review. | App Store Connect › App Privacy |
| 9 | Sign data processing terms with each provider. Most are accepted in account settings: Supabase DPA, OpenAI DPA, Google Cloud data processing terms, Pixian, and the API host. | UK GDPR Article 28. | Each provider's dashboard |
| 10 | Put the company name, number and registered office on the website footer and on emails. | Companies Act 2006 disclosure rules. | |
| 11 | Decide on the minimum age (see below), and if children may use PinHunt, assess the Children's Code. | The ICO Age Appropriate Design Code applies to services likely to be used by under-18s. | ico.org.uk/childrens-code |

## Open questions for the reviewer

- **Minimum age.** The draft says 13+, with under-18s needing a parent's or guardian's permission. The app has **no age check** at sign-up. Disney pin collecting attracts children, so the Children's Code is likely in scope: default-private profiles for minors, Collectors Nearby off by default (it already is), and messaging safeguards. You could also decide on 18+.
- **API server host.** The policy says "Our server host [to be confirmed]". The README documents Replit, but confirm where production runs and its data location.
- **International transfers.** OpenAI, Google and Supabase (depending on the project region) may process data in the US. Confirm the Supabase project region and which transfer mechanism each provider offers.
- **Retention periods.** Confirm how long Supabase backups and server logs are kept, and give a number if possible.
- **Liability clause.** Check that it's reasonable under the Consumer Rights Act 2015.

## Evidence: what the code actually does

| Claim in the policy | Source |
|---|---|
| Email and password via Supabase Auth; no OAuth | `artifacts/pinhunt/app/(auth)/register.tsx`, CLAUDE.md |
| Profile fields: username, display name, avatar, bio, region, trading and contact preferences, visibility | `supabase/migrations/001_schema.sql`, `003_profiles_v2.sql`, `066_contact_preferences.sql`, `068_home_market.sql` |
| Collectors Nearby is opt-in (`nearby_discovery_enabled` defaults false), postcode → approximate coordinates via postcodes.io, coordinates never returned to clients, others see a distance band | `007_collectors_nearby.sql`, `012_profiles_postcode.sql`, `artifacts/api-server/src/routes/geocode.ts` |
| No device GPS | `expo-location` is a dependency but no app code imports it |
| Scan photos go to OpenAI and Google Cloud Vision and are not stored | `artifacts/api-server/src/routes/scan.ts` (OpenAI and `getVisionSignals`), `utils/aiPhotoConsent.ts` |
| Catalogue photos go to Pixian.ai | `artifacts/api-server/src/services/pixian.ts`, `routes/contribute-pin-image.ts` |
| eBay and SoldGraph receive search terms only; market data has no seller columns | `services/ebay.ts`, `services/soldgraph/client.ts`, `049_market_evidence_and_provider_usage.sql` |
| Account deletion: profile, collection, boards, submissions, listings and storage objects deleted; posts, comments and messages kept with the author removed; deletion waits for open trades; audit row has counts only | `051_account_deletion.sql`, `059_trade_problems_and_deletion_hold.sql`, `artifacts/api-server/src/routes/account.ts` |
| Blocks, reports, suspensions | `050_user_blocks_reports_suspensions.sql` |
| AI usage counters for fair-use limits | `049_market_evidence_and_provider_usage.sql` (`provider_usage`), `services/usage-caps.ts` |
| No analytics, crash reporting, ads or push notifications | No Sentry, PostHog, Firebase or `expo-notifications` in `artifacts/pinhunt/package.json` |
| No payments between collectors | CLAUDE.md; `utils/tradingSafely.ts` |

## App Store "App Privacy" answers (draft)

Data **linked to the user**, **not used for tracking**:

- **Contact info:** email address (app functionality).
- **User content:** photos, messages, other user content such as posts, listings and collection (app functionality).
- **Identifiers:** user ID (app functionality).
- **Location:** coarse location, from the postcode, only when Collectors Nearby is on (app functionality).
- **Usage data:** none collected for analytics. AI usage counters are for fair-use limits only (app functionality).

PinHunt does not track users across other companies' apps or websites.

If you add analytics, crash reporting or push notifications later, update this table, the policy and the labels.

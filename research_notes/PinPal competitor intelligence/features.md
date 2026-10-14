# PinPal (thepinpal.com) — Product Features & Business Model vs PinHunt UK

Research date: 2026-10-14. Researcher: Claude Code subagent (research only; nothing in the repo was modified apart from this notes file).

**Method and confidence caveat (read first):** Direct page loads were blocked from this environment. WebFetch failed DNS for thepinpal.com and apps.apple.com, and curl through the agent proxy returned `CONNECT tunnel failed, response 403`. So every PinPal claim below comes from **search-engine extracts of official PinPal pages** (thepinpal.com, and the App Store listing id6756037215 on the Austrian storefront in English). Nobody loaded or viewed those pages in a browser.
- **VERIFIED** = the text was attributed to an official PinPal page (website or App Store listing) in a search extract. It was not directly viewed, so someone with normal web access should spot-check it before it is used externally.
- **ASSUMED** = an inference, or not found in any source.

No social media (Instagram, TikTok, YouTube, Facebook), Product Hunt, press coverage or Google Play listing for this PinPal could be found.

**Name collision warning:** Several unrelated products are also called "PinPal": a bowling scorekeeper by Jeff Stuart (App Store id321817464, Google Play `com.pinpal.full`), a UK pin-binder brand (pin-pal.com, which does UK collector shows), magnetic sewing pin catchers, and a 2014 April Fool's hoax site. Only the **7Labs Cloudware LLC** app and **thepinpal.com** are the Disney competitor.

## Who PinPal is, and its platforms, regions and release history

### Takeaway
PinPal is a young (first release about mid-2025 or 2026; exact year unclear) Disney pin app for iOS, plus a web catalogue at thepinpal.com, from 7Labs Cloudware LLC. It positions itself as "the social network and marketplace for Disney pin collectors". It shipped a full in-app marketplace with cart and checkout around September, and is releasing quickly (version 1.2.7 was about one day old at search time).

### Cited Findings
- VERIFIED: The App Store listing is "PinPal: Pin Trading & Scanner" by 7Labs Cloudware LLC. It is free with in-app purchases and rated 13+. — [App Store (AT, en-GB)](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED: The listing describes PinPal as the social network and marketplace for Disney pin collectors, where users can buy, sell, trade, connect, explore and track collections, discover new releases, and find trading locations. — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED: The website's title is "PinPal — Disney Pin Trading and Collection Platform", and it says users can buy, sell, trade and collect Disney pins. — [thepinpal.com](https://thepinpal.com/)
- VERIFIED: The site's structured data names the iOS app "PinPal: Scan & Organize Pins", which differs from the current store title. That suggests the app has been renamed or the name A/B tested. — [thepinpal.com](https://thepinpal.com/) (via search extract)
- VERIFIED: Version history extracts:
  - 1.0 and 1.1.3 (July and August): "improved pin scanning" and "recent capture previews".
  - 1.2.0 and 1.2.1 (1–2 September): "new marketplace experience", marketplace and cart layouts, **tablet support**, updated events and trading locations.
  - 1.2.2 and 1.2.3 (early September): loading, navigation, images, comments, marketplace images, seller information, cart layout.
  - 1.2.7 (about one day old): checkout reliability, keyboard behaviour, stability.
  - The search tool noted that the dates on the page were inconsistent with each other. — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- Google Play: none found. Searches returned only the bowling app (`com.pinpal.full`) and an unrelated "Pin Trading – Scan & Collect" by Evergreen Apps. — [Google Play (bowling PinPal)](https://play.google.com/store/apps/details?id=com.pinpal.full&hl=en_US); [AppBrain](https://www.appbrain.com/app/pinpal/com.pinpal.full)

### Inferences
- ASSUMED: The App Store ID 6756037215 is in the range Apple assigned around late 2025. Together with versions 1.0 in July and 1.2.x in September, the most likely timeline is a **2026** launch: v1.0 around July 2026 and the marketplace around September 2026. This should be checked on the US or UK storefront.
- ASSUMED: The app is iOS-only plus a web catalogue, with no Android app. iPad is supported since 1.2.0.
- ASSUMED: It is US-centric. The catalogue fields include "origin" (park) and "original retail price", and nothing found mentions GBP, Disneyland Paris or EU shipping.

### Gaps
- Exact release dates, ratings count and score, supported languages, and US or UK storefront availability. The direct App Store fetch was blocked.
- Whether a Google Play app exists under another name.
- Social channels, press coverage, team or founders, funding. Nothing was found.

## AI pin recognition

### Takeaway
PinPal offers a photo-based "visual pin scanner" that returns *possible* visual matches from its own catalogue. It explicitly disclaims authentication. Scanning appears to be **free and unlimited**. No accuracy claims, back-stamp reading or multiple-pins-per-photo capability were found.

### Cited Findings
- VERIFIED: The app has a visual pin scanner that searches the PinPal catalogue for possible visual matches from a photo. The listing says visual search helps identification but **does not authenticate** physical pins. — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED (single extract, moderate confidence): The free features include **unlimited free pin scans**. — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB). This is contradicted in a sense by a separate search over the version history, which found no mention of scan limits. The claim needs a direct check.
- VERIFIED: The website lets users "search Disney pins, review possible photo matches". Its explorer identifies pins "by character, origin, set, year, or photo". There is also a web "Disney pin identifier" tool for when "you have a photo but do not know the exact release". — [thepinpal.com](https://thepinpal.com/); [Explore](https://thepinpal.com/explore); [example set page](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar)
- VERIFIED: Catalogue pages say "A catalog match is a research lead. It does not authenticate the physical pin or establish its value." The site also links a fake-pin inspection guide. — [example pin page](https://thepinpal.com/catalog/pin/3665a1dd-3c44-4a2a-874f-e186f52c535b)
- Competitor context, VERIFIED for those apps: "Pin Trading – Scan & Collect" starts with **20 free scans**, then requires an upgrade, and claims a database of 130k–150k+ pins. "Pin Value" charges $3.99 a week or $34.99 a year. — [Pin Trading App Store](https://apps.apple.com/us/app/pin-trading-scan-collect/id6751493504); [Pin Value Google Play](https://play.google.com/store/apps/details?id=com.eternalbeam.pintrading&hl=en_US)

### Inferences
- ASSUMED: Free unlimited scanning is a deliberate acquisition hook against scan-metered rivals. If true, it undercuts any plan for PinHunt to charge per scan.
- ASSUMED: Recognition is image-embedding similarity against catalogue photos ("possible visual matches"), not a vision LLM reading the pin.

### Gaps
- Accuracy claims, back-stamp or pin-number OCR, multiple pins in one photo, catalogue size. None were found.

## Collection management and sets

### Takeaway
PinPal lets collectors "track collections", and its catalogue has structured set and collection pages with per-pin "For Sale" and "For Trade" counts. Details of the user-side states (owned, wishlist/ISO, for trade), boards or lanyards, import/export and set-completion tracking could not be confirmed.

### Cited Findings
- VERIFIED: The app supports "explore and track collections" and "discover new releases". — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED: Catalogue pin records show origin, collection, set, edition (size), year, sometimes the original retail price, and pin number, plus "For Sale" and "For Trade" counts. — [example pin page](https://thepinpal.com/catalog/pin/09512131-07ea-4c4c-ba10-13ca231b2dcf); [Aurora pin page](https://thepinpal.com/catalog/pin/4d25d3bb-e002-4831-9211-d9333575d92f)
- VERIFIED: Sets have their own public SEO pages (for example "Blue Paint Jar Disney Pins" and "Disney Princess Cameo Disney Pins"). — [set page](https://thepinpal.com/catalog/set/de6981fa-b152-49cf-9d1c-26db86e49b8b/disney-princess-cameo)
- VERIFIED: The site says "organize your collection". — [thepinpal.com](https://thepinpal.com/)

### Inferences
- ASSUMED: Sets are first-class catalogue objects on PinPal too, so this is not a differentiator for PinHunt by itself. Derived X-of-Y completion could still be one, if PinPal does not offer it.
- ASSUMED: The For Trade counts imply a user "for trade" state. A wishlist or ISO state was not seen.

### Gaps
- ISO/wishlist, boards or lanyards, import/export (CSV), set-completion progress. Nothing was found.

## Valuations and pricing data

### Takeaway
No evidence was found that PinPal shows an automated market value. It links a "Disney pin value research guide" and "asking-price references", and shows original retail price where known. Currency appears to be USD only (assumed).

### Cited Findings
- VERIFIED: Pin and set pages direct users to a "Disney pin value research guide" for pricing context, and some mention checking "asking-price references". The site says a catalogue match does not "establish its value". — [set page](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar); [pin page](https://thepinpal.com/catalog/pin/3665a1dd-3c44-4a2a-874f-e186f52c535b)
- VERIFIED: Some records include the original retail price. — [Explore](https://thepinpal.com/explore)
- Not found: eBay sold-data integration, historical price charts, GBP or EUR display.
- Competitor context: PinLore advertises values from matched eBay listings and recent sales history. — [PinLore](https://mwm.ai/apps/app/6770895298)

### Inferences
- ASSUMED: PinPal's own marketplace listing prices may serve as its price signal over time.
- ASSUMED: PinHunt's eBay GB+US comparables give it a UK-relevant valuation edge. This only holds if PinPal truly lacks automated valuation.

### Gaps
- The contents of the value guide, any in-app price figures, currency options, historical charts.

## Trading, marketplace and payments

### Takeaway
PinPal's business core is a **transactional marketplace**: listings, cart, checkout and seller information, launched around 1.2.0. It also has in-app messaging, comments, events and trading locations. This is the opposite of PinHunt's deliberate "no payments between collectors" stance. The fee, escrow, shipping and payout terms were not found.

### Cited Findings
- VERIFIED: Users can list pins and connect through PinPal messaging, and "buy, sell, trade". — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB); [thepinpal.com](https://thepinpal.com/)
- VERIFIED: Version 1.2.0 introduced the "new marketplace experience". Later versions fixed cart layout, seller information, marketplace images and "checkout reliability", which implies payment checkout inside the app. — [App Store version history](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED: The app includes events, trading locations and comments, which are social and community features. — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED: The website lets users browse available listings for buying, selling and trading, and each pin shows For Sale and For Trade counts. — [thepinpal.com](https://thepinpal.com/)
- Not found: commission rate, escrow, buyer protection, shipping labels, payout method, trader reputation or ratings, trade-matching algorithm.

### Inferences
- ASSUMED: PinPal likely takes a cut of marketplace sales, which would be a revenue stream besides Premium. This is unverified.
- ASSUMED: Per-pin For Trade counts give basic "who has it" discovery, similar to PinHunt's `traders/[pinId]`.

### Gaps
- Fee schedule, payment processor, escrow or protection, shipping (especially international and UK), reputation system.

## Subscriptions and pricing tiers

### Takeaway
PinPal sells a "Premium" in-app purchase at two price points: €9.99 and €44.99 on the Austrian storefront. These are probably monthly and yearly, or yearly and lifetime, but that is assumed. What Premium unlocks and whether there is a trial were not found. UK (GBP) and US (USD) prices could not be retrieved.

### Cited Findings
- VERIFIED: The in-app purchases are "Premium" at **€44.99** and "Premium" at **€9.99** (Austrian storefront). — [App Store (AT)](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED (moderate confidence): Unlimited free pin scans are part of the free tier. — same source.

### Inferences
- ASSUMED: The UK prices are most likely Apple's matching tiers, about £9.99 and £39.99–£44.99, and the US prices about $9.99 and $39.99–$49.99. **These are not verified.**
- ASSUMED: With scanning free, Premium probably gates collection or marketplace extras such as listing limits, seller tools or advanced search.

### Gaps
- GBP and USD prices, renewal period, gated features, free trial. The UK and US storefront fetches were blocked by the environment.

## Onboarding

### Takeaway
Almost nothing was verifiable. Known facts: an iOS app (iPhone plus iPad since 1.2.0), a public web catalogue usable without the app, age rating 13+, and an English listing.

### Cited Findings
- VERIFIED: iOS app, rated 13+, free download. — [App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED: The public web catalogue and explorer are open, with SEO pin and set pages. — [Explore](https://thepinpal.com/explore)

### Inferences
- ASSUMED: The public, indexable catalogue pages are an SEO acquisition funnel into the app. PinHunt currently has nothing comparable on the web.

### Gaps
- Sign-up flow, social login (Apple or Google), first-run experience, languages, regions. All were not found.

## PinHunt UK: what ships today (from the repo, read-only)

### Takeaway
PinHunt ships an iOS-first Expo app with these features:
- Two-stage AI scan through its own API server.
- Collection states owned, for trade and wanted (ISO), with boards and auto-derived set progress.
- eBay GB+US market value.
- Community feed and DMs, trader discovery, nearby collectors.
- A "Sell Securely" flow that only creates **external** Vinted or eBay listings. PinHunt never processes payments, by design.

### Cited Findings (repo paths)
- Scan: `POST /api/scan/identify` runs a stage-1 extraction (characters and keywords), a stage-2 catalogue candidate search, then an image-based re-rank of the candidates using OpenAI vision. Google Cloud Vision is also integrated (`services/google-vision.ts`, admin `vision-test`). — `/home/user/Pin-hunt-uk/artifacts/api-server/src/routes/scan.ts`; `.agents/memory/ai-model-quirks.md`
- Collection: `app/(tabs)/collection.tsx` has the tabs Boards, Sets, Traders and ISO. `CollectionContext` statuses are `owned`, `for_trade` and `wanted`. Boards are collector-created with multi-membership. Sets derive automatically with X-of-Y progress that agrees across Collection, Home and Set Detail, and has no manual "track set". — `/home/user/Pin-hunt-uk/CLAUDE.md`; `/home/user/Pin-hunt-uk/.agents/memory/final-v1-collection.md`
- Sets are first-class: `app/catalogue.tsx`, `app/set/[collection].tsx`, `app/set-traders/[collection].tsx`.
- Valuation: `components/MarketValueSection.tsx` calls `routes/market-value.ts`, which uses `services/valuation.ts` (eBay comparables fetched separately for `EBAY_GB` and `EBAY_US`) and `services/ebay.ts`. A memory note sets "asking-price wording rules", so values are based on listings rather than guaranteed sold prices. — `/home/user/Pin-hunt-uk/artifacts/api-server/src/services/valuation.ts`; `.agents/memory/catalogue-validation.md`
- Trading and community:
  - `app/trade/[id].tsx` (trade detail), `app/traders/[pinId].tsx`, `find-trades.tsx`, `find-collectors.tsx`, `nearby.tsx` ("Collectors Nearby" via geocode), `collector/[username].tsx`.
  - Community feed, posts, conversations and chat, with unread DM badges.
- Selling: `app/sell/[pinId].tsx` is the "Sell Securely" screen. Its header comment says it creates an external marketplace listing on Vinted, eBay or other, that PinHunt never processes payments, and that buyers are directed to the marketplace. There is also `app/my-listings.tsx`.
- Catalogue contributions: user pin submissions, image contributions, and admin review, moderation and eBay-backed catalogue validation (`app/contribute*`, `app/admin/*`).
- Auth: Supabase email and password only. `login.tsx` uses `signIn(email, password)`, and CLAUDE.md notes "No OAuth (Google/Apple sign-in) is wired up yet".
- Platforms: iOS-first, also web and Android via react-native-web and Expo. `ios.supportsTablet: false`.
- Roadmap, **not yet built** (CLAUDE.md):
  - Trade Circle (repeat trusted traders)
  - Shareable ISO and For Trade pages
  - Collector-set trade values
  - Improved trade matching
  - Trade-only shipping where each collector buys their own postage
  - Pin & Pop catalogue integration
  - CLAUDE.md also says: do not add payments or escrow.
- GitHub issues were not checked. No issue files were found in the repo, and no API calls were made.

### Inferences
- PinHunt's UK and Disneyland Paris focus, GBP-relevant eBay GB comparables, derived set completion and boards are its clearest differentiators against PinPal's US-centric, marketplace-first model.
- PinPal leads on: an in-app marketplace with checkout, free unlimited scanning (if confirmed), iPad support, events and trading-location content, and an SEO-indexed public web catalogue.

### Gaps
- No subscription or monetisation exists in the PinHunt repo, so pricing cannot be compared like-for-like.

## Feature comparison table: PinPal vs PinHunt UK

| Area | PinPal (status) | PinHunt UK (repo, today) |
|---|---|---|
| AI recognition | Photo "visual pin scanner" returning possible catalogue matches; disclaims authentication (VERIFIED). Accuracy, back-stamp reading and multiple pins per photo not found. | Two-stage scan through the API server: OpenAI vision extracts features, catalogue candidates are searched, then image-based re-ranking. Google Vision is integrated for testing. Single pin per scan. |
| Scan limits | "Unlimited free pin scans" (VERIFIED, moderate confidence; needs a direct check) | No paywall or limit in the repo |
| Web identifier | Public web identifier and explorer by character, origin, set, year or photo (VERIFIED) | None public. The web build of the app exists but sits behind login. |
| Collection states | "Track collections" (VERIFIED). Per-pin For Sale and For Trade counts (VERIFIED). ISO/wishlist not found (ASSUMED absent or unknown). | `owned`, `for_trade`, `wanted` (ISO) as distinct states |
| Boards / lanyards | Not found | Collector-created boards with multi-membership (the default tab) |
| Sets | Public set pages as catalogue objects (VERIFIED). Completion tracking unknown. | First-class sets with auto-derived X-of-Y progress, plus set traders |
| Catalogue metadata | Origin, collection, set, edition size, year, pin number, original retail price (VERIFIED) | Master Catalogue in Supabase with a `PHUK-` ID, characters, categories, sets and verification status, plus contribution and admin review |
| Valuation | Linked value research guide and "asking-price references" (VERIFIED). No automated value, eBay sold data or charts found. Currency assumed USD. | Automated eBay comparables (GB and US marketplaces) with GBP relevance; asking-price wording |
| Trading | Trade listings, For Trade counts, messaging (VERIFIED). Matching and reputation not found. | Trade detail flow, traders per pin and per set, find trades, nearby collectors, DMs. Matching and Trade Circle are on the roadmap. |
| Marketplace | In-app marketplace with cart, checkout and seller info since about 1.2.0 (VERIFIED). Fees, escrow and shipping not found. | No payments by design. "Sell Securely" creates external Vinted or eBay listings. |
| Community | Social network, comments, events, trading locations (VERIFIED) | Community feed, posts, chat, admin posts on Home, moderation |
| Subscriptions | "Premium" IAP at €9.99 and €44.99 (VERIFIED, AT storefront). Periods, gated features and trial unknown. GBP and USD not retrieved. | None |
| Onboarding / auth | iOS, 13+ (VERIFIED). Social login unknown. | Email and password only via Supabase; profile completion; no Apple or Google login yet |
| Platforms | iPhone and iPad (iPad from 1.2.0) plus a web catalogue (VERIFIED). No Android found. | iOS-first (no tablet); Android and web via Expo |
| UK / EU relevance | No GBP, Disneyland Paris or UK shipping evidence found (ASSUMED US-centric) | UK and Disneyland Paris focus; eBay GB; trade-only shipping planned with each collector paying their own postage |
| Release cadence | v1.0 (July) to 1.2.7 (about Oct), roughly 10 releases. Year is likely 2026 (ASSUMED). | Active development; V1 Collection architecture finalised |

# PinPal (thepinpal.com): Image Sourcing, Licensing and Public Technical Surface

Researched 2026-10-14. **Method limitation (important):** the research environment could not reach thepinpal.com directly. `curl` was refused by the egress proxy (CONNECT 403, `connect_rejected`) for `/`, `/robots.txt` and `/sitemap.xml`, and WebFetch failed DNS resolution for `thepinpal.com`, `www.thepinpal.com` and `apps.apple.com`. Everything below therefore comes from **search-engine indexes and snippets** (label: `search_snippet`), not from page source. No pages were scraped, no images were downloaded and no endpoints were probed. Consistent with `research/catalogue-engine/access_policy.json` (`default: deny`), thepinpal.com should be recorded there as `network_reachable: false`, `robots_txt_checked: false`, `terms_reviewed: false`.

Labels: **VERIFIED** = stated in an indexed PinPal or App Store page (seen through a search snippet, so it is a secondary view of a primary source). **INFERRED** = reasoning from those facts. **UNKNOWN** = could not be determined.

## 1. Where are PinPal's images hosted, and where does the catalogue data come from?

### Takeaway
I could not determine the image host or the CDN because the page source was unreachable. PinPal's indexed pages say each catalogue record has "reference images" and describe records as "approved PinPal records". That suggests an internal moderation and approval pipeline, but they do not say where the images come from (Disney, Pin & Pop, PinPics, eBay, or user uploads).

### Cited Findings
- VERIFIED (search_snippet): Set pages describe themselves as grouping "the approved PinPal records currently assigned to the Blue Paint Jar set", with reference images and release details for each pin. — [Blue Paint Jar set](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar)
- VERIFIED (search_snippet): Pin pages list origin, collection, edition size, year and retail price. Examples: Aurora, Disneyland 60th Anniversary, 2015, Diamond Celebration Event, edition of 3,000. Queen of Hearts "Adorbs", 2021, WDI, LE 300. Simba Symbol, Lion King Icons, 2017, $10.00, showing 1 collector, 1 for sale and 1 for trade. — [Aurora](https://thepinpal.com/catalog/pin/4d25d3bb-e002-4831-9211-d9333575d92f); [Queen of Hearts](https://thepinpal.com/catalog/pin/374af210-6e8a-4c3b-bd1e-470129df845f); [Simba Symbol](https://thepinpal.com/catalog/pin/45b4ac0d-9a25-41f4-a783-ff0bab10a7b3)
- VERIFIED (search_snippet): The catalogue includes very recent releases, such as Elsa, Anna & Olaf (Frozen), a 2026 Hong Kong Disneyland open-edition pin. — [Elsa, Anna & Olaf](https://thepinpal.com/catalog/pin/09512131-07ea-4c4c-ba10-13ca231b2dcf)
- VERIFIED (search_snippet): Pin pages carry a disclaimer: "A catalog match is a research lead. It does not authenticate the physical pin or establish its value." — [PinPal catalogue pages via search](https://thepinpal.com/catalog/pin/45b4ac0d-9a25-41f4-a783-ff0bab10a7b3)
- VERIFIED (search_snippet): No indexed PinPal page that I found states where images or catalogue data come from. Searches for "about", "sources" and "image" on the domain only returned catalogue and explore pages. — [Explore](https://thepinpal.com/explore)

### Inferences
- INFERRED: The words "approved records" imply a submission or curation queue, possibly user-contributed data that admins approve. This is not confirmed.
- INFERRED: Data fields such as WDI, DEC (Disney Employee Center), LE size, origin park and retail price closely match the fields used by the big community databases (PinPics, Pin & Pop, Collectible PinTrader). A seed import from one or more of them is plausible, but **there is no evidence for it**, so do not repeat it as fact.
- INFERRED: Coverage of a 2026 HKDL release suggests ongoing curation, not a static one-time import.

### Gaps
- Image host or CDN (own bucket, Supabase/Firebase storage, Cloudinary, or hotlinks to shopDisney, eBay, Pin & Pop or PinPics): **UNKNOWN**. Viewing the `<img src>` of one pin page in a normal browser would answer this. That is a manual, non-intrusive check PinHunt staff could do.
- Whether images are user photos or official stock images: **UNKNOWN**.
- Catalogue size (pin count): **UNKNOWN**. No figure was found for PinPal. The 130,000+ figure that appears in search results belongs to a different app, "Pin Trading - Scan & Collect" (pintrading.io).

## 2. Terms of Service, privacy, ownership, licensing and attribution

### Takeaway
PinPal's homepage links to a Terms of Service and a Privacy Policy, but neither document is in the search index, so their wording on ownership, user-content licences and scraping is **UNKNOWN**. I found no attribution to any data partner and no evidence of a Disney licence.

### Cited Findings
- VERIFIED (search_snippet): The homepage footer links to "Terms of Service" and "Privacy Policy" pages. Their text was not returned by any search. — [PinPal homepage](https://thepinpal.com/)
- VERIFIED (search_snippet): The pin pages' disclaimer says catalogue membership does not authenticate a pin or establish its value. — [PinPal pin page](https://thepinpal.com/catalog/pin/374af210-6e8a-4c3b-bd1e-470129df845f)
- VERIFIED (negative result): Searches for a 7Labs or PinPal partnership with Pin & Pop, PinPics, Collectible PinTrader or Disney returned nothing. — [search: thepinpal.com about pin database sources image](https://thepinpal.com/explore)

### Inferences
- INFERRED: Most consumer-app ToS (default position) claim ownership of the compilation and prohibit scraping, automated extraction and commercial reuse, and take a non-exclusive licence over user uploads. **Assume** PinPal's ToS does the same until a human reads it.
- INFERRED: There is no sign of any Disney licence. Comparable apps disclaim affiliation; for example, MagicPin by S&P Holbrook LLC states it is "not affiliated with the Walt Disney Company" ([MagicPin App Store](https://apps.apple.com/app/id1554341677)). PinPal is very likely in the same unlicensed fan-tool position, so its pin imagery would be photos of Disney-copyright artwork with no licence PinPal could pass on.

### Gaps
- Exact ToS clauses on IP ownership, user-content licence, scraping and data extraction, and governing law: **UNKNOWN**. A human should open https://thepinpal.com/ and read the footer links, then record `terms_reviewed` in `access_policy.json`.
- Privacy labels from the App Store: not retrieved because apps.apple.com was unreachable.

## 3. Public API, developer docs, sitemap, robots.txt, structured data, affiliates

### Takeaway
I found no public API, developer documentation, data export or partnership programme. robots.txt and sitemap.xml could not be read because direct access was blocked. The site is clearly crawlable and indexed, since many per-pin and per-set pages appear in search results.

### Cited Findings
- VERIFIED: Direct requests to `https://thepinpal.com/robots.txt` and `/sitemap.xml` were refused by this environment's egress proxy. The content is **UNKNOWN**. — (local tool result, 2026-10-14)
- VERIFIED (search_snippet): Search engines index many per-pin pages (`/catalog/pin/{uuid}`) and set pages (`/catalog/set/{uuid}/{slug}`), with SEO-style titles such as "Blue Paint Jar Disney Pins" and "Disney Pin Database and Collection Explorer". — [Explore](https://thepinpal.com/explore); [Disney Princess Cameo set](https://thepinpal.com/catalog/set/de6981fa-b152-49cf-9d1c-26db86e49b8b/disney-princess-cameo)
- VERIFIED (negative result): Searches for terms about an API, developers, export or partners on thepinpal.com returned nothing. — [PinPal homepage](https://thepinpal.com/)

### Inferences
- INFERRED: Strong per-entity SEO (one page per pin and per set, descriptive titles) suggests server-side rendering or static generation. That would fit a Next.js-style framework, but this is unconfirmed.
- INFERRED: Pages mention "asking-price references", so outbound marketplace or affiliate links are possible. This is unconfirmed.

### Gaps
- robots.txt rules, sitemap structure, schema.org (`Product`/`ItemList`) markup and affiliate parameters: all **UNKNOWN** without page source.

## 4. Catalogue structure and search features

### Takeaway
PinPal has a public web catalogue, not only an in-app one. It has UUID-keyed per-pin pages, UUID-plus-slug set pages, and an `/explore` database browser. Search covers character, origin, set, year and photo. Sets are first-class objects, the same as in PinHunt.

### Cited Findings
- VERIFIED (search_snippet): URL scheme: pins at `/catalog/pin/{uuid}`, sets at `/catalog/set/{uuid}/{slug}`, and the browser at `/explore`. — [Hei Hei pin](https://thepinpal.com/catalog/pin/b62e7f2d-df50-459d-9611-445d4ab213ae); [Mickey Mouse Head Fire Breathing Dragon set](https://thepinpal.com/catalog/set/e7fc5a08-0666-402a-859d-51dfb2524948/mickey-mouse-head-fire-breathing-dragon)
- VERIFIED (search_snippet): `/explore` lets users "search the PinPal Disney pin database, browse collections and recent releases, and identify pins by character, origin, set, year, or photo". — [Explore](https://thepinpal.com/explore)
- VERIFIED (search_snippet): Set pages list member pins with collection, year and origin. Blue Paint Jar has 10 pins from the "Color Shades of Magic" collection, all DEC, 2024, with characters including Blue Fairy, Cinderella, Elsa, Genie and Stitch. — [Blue Paint Jar](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar)
- VERIFIED (search_snippet): Pin pages show social and market counts (collectors, for sale, for trade) and link to a fake-pin inspection guide or checklist and to "asking-price references". — [Simba Symbol](https://thepinpal.com/catalog/pin/45b4ac0d-9a25-41f4-a783-ff0bab10a7b3)
- VERIFIED (search_snippet): The App Store listing describes a social network and marketplace (buy, sell, trade, follow, direct messages, new releases, trading locations), plus photo search that "does not authenticate physical pins". It is free with in-app purchases, unlimited scans, rated 13+, in the Lifestyle category. — [PinPal App Store listing](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)

### Inferences
- INFERRED: Public UUIDs and no human-readable public ID (unlike PinHunt's `PHUK-xxxxxxxx`) mean cross-referencing would have to rely on name, set, year and edition matching, not on a shared identifier.
- INFERRED: The "for sale" counts and the "marketplace" wording mean PinPal may handle buying and selling. That differs from PinHunt's no-payments, trade-only stance.

### Gaps
- Text search syntax, filter facets beyond those listed, and the image-search technology: **UNKNOWN**.
- Whether a Google Play or Android version exists: no 7Labs PinPal listing was found. Other "PinPal" listings on Play are unrelated (for example, a bowling app). — [unrelated PinPal on Google Play](https://play.google.com/store/apps/details?id=com.pinpal.full&hl=en_US)

## 5. Tech stack signals

### Takeaway
**UNKNOWN.** HTTP headers and page source were unreachable from this environment.

### Cited Findings
- VERIFIED: The proxy refused the connection, so no headers were obtained. — (local tool result)
- VERIFIED (search_snippet): Lowercase UUID v4 identifiers in URLs, such as `09512131-07ea-4c4c-ba10-13ca231b2dcf`. — [Elsa, Anna & Olaf](https://thepinpal.com/catalog/pin/09512131-07ea-4c4c-ba10-13ca231b2dcf)

### Inferences
- INFERRED (weak): UUID v4 primary keys are typical of Postgres-backed stacks such as Supabase, and also of many other backends. This is not evidence of any specific vendor.

### Gaps
- Framework, hosting, CDN and backend: a manual browser check is needed (response headers such as `server`, `x-vercel-id` or `cf-ray`, and asset paths).

## 6. Who runs PinPal

### Takeaway
The App Store developer is **7Labs Cloudware LLC**. "LLC" suggests a US-registered company. I found no founders, funding or press coverage, and the iOS app looks recent (late 2025 or 2026).

### Cited Findings
- VERIFIED (search_snippet): Developer "7Labs Cloudware LLC", website thepinpal.com, App Store id 6756037215. — [PinPal App Store listing](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED (negative result): Searching for "7Labs Cloudware" returned only unrelated similarly named companies (7labs.io tech blog, 7Labs LLC, SevenLabs, SevenLab Amsterdam, Web7Labs). None is linked to PinPal. — [7labs.io about](https://7labs.io/about); [7Labs LLC LinkedIn](https://www.linkedin.com/company/7labs)
- VERIFIED (search_snippet): A search summary said the App Store listing was "about 35 days old". The crawl date is unknown, so treat this only as a rough sign that the app is recent. The high App Store id (6756…, compared with 6751… for Pin Trading - Scan & Collect) also fits a late-2025 launch. — [PinPal App Store listing](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB); [Pin Trading - Scan & Collect](https://apps.apple.com/us/app/id6751493504)

### Inferences
- INFERRED: As a US LLC, PinPal operates outside UK/EU database right territory unless it qualifies through an EEA/UK-connected maker (see section 7).

### Gaps
- State of registration, officers, founders, funding and exact launch date: **UNKNOWN**. Check US state registries (for example Delaware or Wyoming), OpenCorporates, and the App Store "Information" panel by hand. No UK Companies House entity was searched or found.

## 7. Legal assessment for PinHunt UK (not legal advice; a lawyer should confirm)

### Takeaway
**(a) Direct import: no.** It carries a high risk under the ToS (contract) and copyright in the images, and possibly database right. **(b) Verification cross-reference: only as a manual research lead** for insubstantial, individual lookups, never systematic extraction, and only after a human reads the ToS. **(c) The safest default is to not use PinPal data at all** and to rely on sources PinHunt has rights to.

### Cited Findings
- VERIFIED: UK database right (Copyright and Rights in Databases Regulations 1997, reg. 16) is infringed by extracting or re-utilising all or a substantial part of a database's contents without consent. Repeated and systematic extraction of insubstantial parts can amount to a substantial part. — [legislation.gov.uk reg 16](https://www.legislation.gov.uk/uksi/1997/3032/regulation/16?view=plain)
- VERIFIED: The sui generis right protects makers who show substantial investment in obtaining, verifying or presenting contents, and lawful users may extract insubstantial parts. — [Directive 96/9/EC Art. 7 (retained)](https://www.legislation.gov.uk/eudr/1996/9/article/7); [Art. 8](https://www.legislation.gov.uk/eudr/1996/9/article/8/data.xht)
- VERIFIED: The term is 15 years from completion, and substantial changes restart the term. — [1997 Regs notes](https://www.legislation.gov.uk/uksi/1997/3032/note)
- VERIFIED (internal policy): PinHunt's catalogue fetch policy defaults to deny and needs robots.txt plus a ToS review before any host is fetched. — `/home/user/Pin-hunt-uk/research/catalogue-engine/access_policy.json`
- VERIFIED (internal): Collectible PinTrader data and images are already used on a two-part basis: a public Creative Commons export plus explicit permission from the developer. The exact CC variant is still pending, and the evidence record has TODOs. — `/home/user/Pin-hunt-uk/.agents/memory/collectible-pintrader-rights.md`
- VERIFIED (internal): As of the January 2026 notes, PinHunt catalogue images came from eBay backfill, which had wrong-image problems that an AI vision audit caught. — `/home/user/Pin-hunt-uk/.agents/memory/pinhunt-images.md`

### Inferences
- INFERRED, database right qualification: UK database right after Brexit generally protects makers who are UK nationals, residents or companies. EU sui generis right protects EEA makers. A US LLC (PinPal) may **not qualify** for UK/EU sui generis protection at all. **A lawyer must confirm this.** It is a significant point, but it does not make copying safe, because the ToS contract and image copyright apply independently.
- INFERRED, copyright: Pin images are photos of Disney-copyright artwork. The photo itself may also attract copyright for the photographer, whether PinPal, a user or a retailer. Copying images is the clearest risk under any scenario. Factual fields (name, year, edition size, origin) are not copyright-protected individually, but their selection and arrangement can be.
- INFERRED, contract: If the ToS prohibits scraping or commercial reuse, which is typical, browsing and copying even small amounts breaches the contract (see the CJEU's *Ryanair v PR Aviation*, C-30/14, where ToS can restrict use of unprotected databases; a lawyer should confirm how this applies in the UK).
- INFERRED, recommendations:
  - (a) Direct import, whether bulk or images: **do not**.
  - (b) Cross-reference: acceptable only as a **human, one-off research lead** (for example, an admin looking up a single pin to resolve a conflict), with no copied images and no automated lookups. Then corroborate against a rights-cleared source and record that source, not PinPal, as provenance in the Master Catalogue. Set PinPal's `access_policy.json` entry to `fetch_permitted: false`.
  - (c) If the ToS forbids even this, do not use PinPal at all.
- INFERRED, legitimate alternatives:
  1. A **partnership or licence request** to 7Labs Cloudware LLC via thepinpal.com contact, which is low cost to ask.
  2. **Collectible PinTrader**, which is already permitted. Finish its evidence record and confirm the CC variant first.
  3. **User-submitted photos with explicit consent and a licence grant** in PinHunt's own ToS. This fits the existing pin submission flow.
  4. **Official Disney sources** (shopDisney, Disneyland Paris, Disney Store UK) for **facts** such as names, dates and prices, cited as provenance. Do not copy their images without permission. They are currently unreachable from the research environment according to `access_policy.json`.
  5. **eBay**, through its official API under eBay's API licence terms. It is already integrated and needs verification against the title.
  6. A **Pin & Pop** integration, which is already being explored according to CLAUDE.md, through the `PinRepository` seam.

### Gaps
- PinPal's actual ToS text, which decides the contract analysis: **UNKNOWN**.
- Whether PinPal's maker qualifies for UK/EU database right, and the effect of the post-Brexit reciprocity rules: **needs a lawyer**.
- No UK IPO guidance page was retrieved. The analysis relies on legislation.gov.uk texts only.

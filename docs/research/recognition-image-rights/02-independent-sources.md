# Independent recognition image sources: deep dive (Oct 2026)

**Status: research only.** Separate from the autonomous catalogue sprint. Nobody was contacted. No images were downloaded. No issues were created and nothing in the app, schema or data changed.

**Scope change from `README.md`:** Pin & Pop is handled separately by the maintainer's existing discussions and is **excluded** here.

**How to read the labels**
- **CONFIRMED (snippet):** a search-engine result showed this text at the cited URL. This session's network blocked direct page loads for every site below, so no page was read in full. Re-read each one before relying on it.
- **CONFIRMED (repo):** read in this repository.
- **ASSUMPTION:** judgement or estimate.
- **Not legal advice.** §5 is research for briefing a UK IP solicitor.

---

## 1. What we already have, and the coverage gap

| Fact | Evidence |
|---|---|
| The trusted catalogue served today has 182 pins from 2024–2026: 156 Disney Parks and 26 Disney Store. Parks are WDW, Disneyland, EPCOT and Shanghai. **There are 0 Disneyland Paris pins and 0 UK pins.** | CONFIRMED (repo): `attached_assets/PinHunt_UK_Trusted_Test_Catalogue_*.xlsx` |
| The 13k seed's 938 "Disneyland Paris" rows are AI-expanded and speculative. They are not a usable DLP catalogue. | CONFIRMED (repo): `../independent-catalogue-poc/README.md` |
| Collectible PinTrader (CTP) records carry `related_ids.PINPICS` and `related_ids.PINTRADINGDB`. The importer writes them to `pin_external_ids`. | CONFIRMED (repo): `artifacts/api-server/scripts/import-collectible-pintrader.mjs` |
| The trusted catalogue already cites PinPics as a validation source on 14 pins. | CONFIRMED (repo) |

**Consequence for every source:** a recognition image is only useful once it is attached to a Master Catalogue record. For our core UK/DLP market, **the catalogue records don't exist yet**. So any DLP image deal has close to zero overlap with today's catalogue and depends on DLP catalogue research. That research belongs to the catalogue workstream, not this one, so this doc flags the dependency and leaves it alone.

On the plus side, PinPics and PinTradingDB IDs give us a **ready-made join key** to those archives through the CTP crosswalk.

---

## 2. Ranked shortlist of real opportunities

Ranked by **rights-chain strength × coverage of what we need × realism**. Contact routes are **public business channels only**. Nobody has been contacted.

### 1. PinPics: best rights chain and largest original archive

| | |
|---|---|
| **Who controls the photos** | PinPics, owned since June 2021 by "Molly & Joe" and funded by weekly PinPics Live sales. CONFIRMED (snippet): [team](https://pinpics.com/team), [about](https://www.pinpics.com/about). Its registration terms say user content including pin images "becomes the intellectual property of Pin Pics". Members also grant "an exclusive, sub-licensable, irrevocable and royalty-free worldwide license". CONFIRMED (snippet, truncated): [terms](https://pinpics.com/terms). |
| **Original photography?** | The photo guide requires members' own photos on a white background, cropped, with a separate back photo. It bans copying from eBay or other sites. CONFIRMED (snippet): [photo guide](https://pinpics.com/guides/database/pinphotos/). Staff review submissions; only metal, officially licensed Disney pins are accepted. CONFIRMED (snippet). How well this was enforced, especially before 2021, is an ASSUMPTION. |
| **Contact** | info@pinpics.com, the business address in its terms for permission requests. CONFIRMED (snippet). |
| **Unique pin coverage** | 156,000+ listings (March 2026), up to six photos each. CONFIRMED (snippet). DLP pins are present, including 2023–24 entries ([156498](https://www.pinpics.com/pin/156498), [162936](https://pinpics.com/pin/162936)). A DLP collector calls it their "first port of call" for new DLP releases. CONFIRMED (snippet). DLP depth for 2024–26 is an ASSUMPTION: moderate. |
| **Overlap with our catalogue** | High for the 182 trusted pins (US/Store 2024–26). High for the CTP catalogue through the `pinpics` external IDs. For DLP it fills a gap rather than overlapping. |
| **Embedding rights negotiable?** | Realistic. The terms suggest PinPics *can* sub-license, which no other community archive offers. |
| **Likely cost** | ASSUMPTION: £2k–£15k one-off for an internal, non-display embedding licence on a subset, e.g. 2015–2026 plus all DLP. £15k–£50k+ or a revenue share for the full archive. |
| **Obstacles** | (a) In 2018 PinPics refused permission to Collectible PinTrader, which then rebuilt its database from scratch. CONFIRMED (snippet, [DPF thread](https://www.disneypinforum.com/threads/collectible-pintrader-app-ios-and-android-for-tracking-trading.64812/)). That was under the previous owners, but it suggests caution about rival apps. (b) Pre-2021 uploads may sit under older, weaker terms. (c) Possible exclusivity or competitor concerns. (d) Database right in the archive (§5.6) means the deal must also license the extraction. (e) Disney's layer remains (§5). |

### 2. Collectible PinTrader: already in hand, but the rights chain is unproven

| | |
|---|---|
| **Who controls the photos** | Developer: Smallcandles LLC on iOS, "Collectible Apps" on Google Play. CONFIRMED (snippet): [App Store](https://apps.apple.com/us/app/collectible-pintrader/id1391365467), [AppBrain](https://www.appbrain.com/app/collectible-pintrader/com.collectibleapps.PinTrader). Photos were **user-submitted**. CTP's terms say submitted images "must be your own or you must have the owner's permission" and grant Collectible Apps the right "to use and modify that information and/or images in perpetuity for whatever purposes it sees fit". CONFIRMED (snippet): [terms](https://collectiblepintrader.com/terms/). Whether that lets CTP **sub-license** to PinHunt is not stated. ASSUMPTION: arguable, not clear. |
| **Status** | Launched July 2018. Last iOS update Jan 2022. Android unpublished 11 Jan 2025. CONFIRMED (snippet). Effectively dormant: ASSUMPTION. |
| **The "public CC export"** | The only public trace is the developer's **2018 promise** in the DPF launch thread: "all images and most of the pin information will be shared with the public under a Creative Commons License", with an export to Google Drive planned but "not yet uploaded". CONFIRMED (snippet). No published export, no licence variant and no hosting URL were found. One paraphrase hints at ShareAlike: ASSUMPTION. Yet the team does hold a real export: the importer was validated against "the live 589-group export" of base64 JPEGs. CONFIRMED (repo). So the export was presumably obtained privately, matching the "direct permission" limb of `.agents/memory/collectible-pintrader-rights.md`, **whose evidence fields are still empty**. |
| **Contact** | The existing relationship, per the rights memo. |
| **Unique pin coverage** | One forum user says "only 20,000 pins". CONFIRMED (snippet, weak). The export spans 589 set groups. CONFIRMED (repo). Mostly US: ASSUMPTION. |
| **Overlap** | It *is* our Catalogue V2 seed, so overlap is total by construction. |
| **Embedding rights negotiable?** | Probably easy to ask, since there is goodwill. But it is only worth as much as CTP's sub-licensing right and the user-submission chain. |
| **Cost** | ASSUMPTION: nil or goodwill. |
| **Obstacles** | Sub-licensability. Unknown CC variant: BY-SA would complicate derived artefacts. The evidence record is unfilled. **Existing exposure, not acted on:** the importer writes CTP images with `public_display_allowed = true`. So any CTP images already published rely on undocumented permission. |

### 3. Samra's Pins (UK): the best UK/DLP dealer lead

| | |
|---|---|
| **What and who** | UK shop with a "Disneyland Paris Pins — Every Monthly Release" page priced at about £30–65 ([page](https://samraspins.co.uk/disneyland-paris-pins)). Described on Trustpilot as a "Disneyland Paris Personal Shopping Service", rated about 4.7 from about 33 reviews ([Trustpilot](https://de.trustpilot.com/review/samraspins.co.uk)). Also sells on eBay ([example LE 700 Phantom Manor](https://www.ebay.de/itm/396533092781)). CONFIRMED (snippet). A single small business controls its photos: ASSUMPTION. |
| **Contact** | The website contact page. |
| **Coverage** | ASSUMPTION: several hundred DLP pins, mostly 2023–2026 monthly releases. **This is exactly our gap.** |
| **Negotiable?** | High: a small commercial seller, and a licence fee is incremental income. ASSUMPTION. |
| **Cost** | ASSUMPTION: £250–£2,000 flat, or £0.25–£1 per image, plus credit. |
| **Obstacles** | We must separate photos they took from DLP's official press images. Ask for a per-image warranty and, ideally, raw files. |

### 4. Stewpins / GoPinPro: a DLP release reseller

| | |
|---|---|
| **What and who** | DLP open-edition and limited-edition sections, some priced in GBP. Its About Us page says it sources the newest DLP releases ([OE](https://www.stewpins.com/open-edition), [about](https://www.stewpins.com/about_us)). It links to a related brand, [GoPinPro](https://gopinpro.com/). CONFIRMED (snippet). The business controls its photos: ASSUMPTION. |
| **Contact** | The site's About/contact page. |
| **Coverage / cost / obstacles** | Same profile as Samra's: current DLP releases, a small dealer fee, and an official-vs-own photo check. |

### 5. eBay store "dlppins": a DLP back-catalogue specialist

| | |
|---|---|
| **What and who** | Says it specialises in Disneyland Paris pins, with many pins not listed. Over 1,000 feedback entries. A business seller with 1,873 items sold ([store](https://www.ebay.com/str/dlppins), [listing](https://www.ebay.de/itm/388460104468)). CONFIRMED (snippet). |
| **Contact** | eBay messaging only. ASSUMPTION: eBay's rules on moving deals off-platform are aimed at item sales, but check that a photo-licence enquiry through eBay messages is acceptable. |
| **Coverage** | ASSUMPTION: a deep DLP back-catalogue, about 2017–2025. Single-pin listing photos. |
| **Obstacles** | Seller location and identity are unconfirmed. Do not reuse photos taken from eBay itself: eBay's API and AI terms bar it (README §1). |

### 6. PinTradingDB: mid-size, but rights unclear

| | |
|---|---|
| **What and who** | About 57,000 pins, with Disneyland, WDW and Tokyo coverage. Started as "Ryan's Pin Trading Database". The footer reads "Site design by Overman Co." ([site](https://www.pintradingdb.com/)). CONFIRMED (snippet). |
| **Contact** | The public [Facebook page](https://www.facebook.com/pintradingdb/). |
| **Overlap** | Joinable through the CTP `pintradingdb` IDs. Little evidence of DLP coverage. |
| **Obstacles** | Its terms weren't readable. Without an assignment or sub-licence clause, the photos stay with uploaders. ASSUMPTION. Rank it below PinPics until its terms are read. |

### 7. Disney Pins Blog: a small original slice, mostly US

| | |
|---|---|
| **What and who** | A long-running release-news blog. It has a "Disney Store UK" category and covered the 2024 Disney Store Europe "Magical Collections" and a 2025 Selfridges event. It mixes its own photos (e.g. 2015 Walt Disney Family Museum) with credited third-party ones. CONFIRMED (snippet). Also the source URL for 733 seed rows. CONFIRMED (repo). |
| **Contact** | The site contact page, if one exists; not found in this session. |
| **Obstacles** | Most release images are probably Disney's official ones. ASSUMPTION. Only the blog's own photos could be licensed, so yield would be low. |

### 8. Coleka (France): the densest DLP list, fragmented rights

| | |
|---|---|
| **What** | A French collectors' database. Its list of 148 Disneyland Paris "Refresh" pins carries photos and collector statistics ([page](https://www.coleka.com/en/other-collections/pins/disney-disney-parks-pins/disneyland-paris-refresh_r9532)). CONFIRMED (snippet). |
| **Rights** | ASSUMPTION: user-uploaded. Whether Coleka's terms give it a sub-licensable licence is **unknown**. That is the one question that would move it up the ranking. |
| **Best use** | A DLP coverage reference for the catalogue workstream, and possibly a recruiting ground for Founding Collectors (§4). |

### 9. Individual DLP and UK collectors: recruit them, don't license them

There are active DLP threads on Disney Pin Forum ([DLP thread](https://disneypinforum.com/threads/disneyland-paris-pins.34609)) and DLP Guide's UK-centric forum, which runs pin-trading-night threads. There is also one collector blog with a personal DLP collection ([Dedicated to DLP](https://dedicatedtodlp.com/the-vault/a-new-disneyland-paris-pin-and-the-pin-collection/)). CONFIRMED (snippet).

Forum terms give the forum a **non-sub-licensable** licence tied to the service, e.g. [DPF terms](https://www.disneypinforum.com/help/terms/). CONFIRMED (snippet). So the forums cannot license photos, and only the individual collectors can. That is a recruitment channel for §4, not a licensing deal.

### Investigated and ruled out

| Candidate | Why |
|---|---|
| Existing datasets (Roboflow, Hugging Face, Kaggle, academic papers) | No enamel or lapel pin image dataset exists. "Pin" datasets are electronics pins, a document format, or Pinterest faces. CONFIRMED (snippet). |
| "Pin Trading – Scan & Collect" (Evergreen Apps), MagicPin | Direct competitors. Image provenance is unknown. |
| Van Eaton Galleries, Heritage | No archive of pins in volume. |
| WDWNT, Laughing Place, DLP Town Square, DLP Guide, MickeyBlog | Release posts appear to republish DLP's official images. ASSUMPTION. Not original photography. |
| Disney Store UK, Selfridges and Disney Store events | Disney- or retailer-owned imagery. Only Disney can license it. |
| The Mouse Warehouse (eBay, Florida) | Large original stock photography, but mostly WDW pins. Keep it as a **US fallback** if PinPics fails. |
| Leads not found: "Pin Trading UK" meet organisers, UK pin YouTubers and Instagram accounts, DLP Report, ED92, DLPWelcome, Val d'Europe dealers | Probably reachable only through Facebook, Instagram or Discord, which need logins. Worth a manual pass by the maintainer. |

---

## 3. Coverage scenario

All figures are ASSUMPTIONS.

| Combination | Unique pins with ≥1 licensed photo | DLP/UK pins |
|---|---|---|
| CTP alone, if embedding is confirmed | up to ~20k, mostly US, older | low |
| + PinPics, 2015–2026 + DLP subset | ~40–80k | ~1–3k |
| + 3 UK/DLP dealers (Samra's, Stewpins, dlppins) | +0–2k net new | +500–1.5k |
| + Founding Collectors, year one | +1–3k, but **multi-photo, real-world angles** | UK/DLP-weighted |

The licensed archives supply **breadth**: one clean gallery image per pin. Founding Collectors supply what recognition actually needs: **depth and realistic query-like photos**, especially for UK/DLP. Neither replaces the other.

---

## 4. Founding Collector photo-contribution programme

The programme builds on what already exists. Nothing below is implemented or queued.

**What already exists:**
- the `profiles.is_contributor` tier
- the `feature_flags.catalogue_contributions` audience switch
- the `get_catalogue_image_coverage()` "Help build the catalogue" screen (migration 039)
- the Pixian contribution flow and admin review queue
- admin auto-publish (migration 038 and `routes/contribute-pin-image.ts`)

### 4.1 Who and how many
- **Wave 0, the offline pilot from `README.md` §5:** App Creator, admins, and 5–10 trusted collectors.
- **Wave 1:** 25 invited Founding Collectors, weighted to DLP and UK. Recruit from DLP forum regulars, UK trading-night attendees, and customers of the dealers in §2. Grant them the `is_contributor` tier and set the flag audience to `contributor`; both are config switches that already exist.
- **Wave 2:** 100. **Wave 3:** 500, at which point the programme opens to applications.
- **Adults only (18+).** Pin collecting has many young collectors, and a minor can't reliably grant a copyright licence. Ask for a date-of-birth confirmation at enrolment.

### 4.2 Founding Collector agreement
A separate, versioned agreement. Per-photo consent then references its version.
- Contributor warrants that **they took the photo** and it shows only pins they physically hold.
- **Non-exclusive** licence. The contributor keeps copyright.
- Uses are listed separately (README §3): storage, transformation (Pixian crop and background removal, resize, watermark), **generating and using embeddings for PinHunt pin recognition**, and optional public display with opt-in credit.
- **Withdrawal:** withdrawing a photo stops all future use. The photo and every derived embedding are deleted within a stated SLA, e.g. 30 days. Already-trained aggregate models are a solicitor question (§5).
- No people, faces, documents or location in frame. EXIF is stripped on upload.
- **No payment between collectors.** This matches PinHunt's no-escrow principle. Any reward PinHunt gives is non-cash or a small fixed perk, which avoids turning contributors into commissioned photographers with different IP defaults.

### 4.3 Shot list
Up to 5 photos per pin, all on the existing upload path:
1. **Front, clean.** Goes through Pixian and becomes the catalogue gallery image.
2. **Front, raw.** Kept privately for training only, never displayed.
3. **Angled, about 30°.**
4. **Back / backstamp.** Shows edition, LE size and year, which separates near-identical siblings.
5. **In hand or on a lanyard or board.**

This mirrors the P1/P2 protocol in `../scan-independence/test_manifest.csv`.

### 4.4 What to ask for
The coverage screen becomes a **wanted-photos queue**, ranked by:
1. pins scanned recently that had no or weak reference images (failed or "Weak" scans)
2. UK/DLP pins once catalogued
3. sibling-heavy sets where confusion is highest: Windows of Attraction, Princess Pastries, mystery boxes
4. set completion: "3 pins left to finish this set's photos"

### 4.5 Quality and provenance gates
In order: cheapest checks first, humans last.
1. **Automatic:** resolution, blur and exposure checks; Pixian success; exact duplicate via `content_hash`; perceptual near-duplicate against other contributors.
2. **Provenance:** a reverse-image check that flags photos already on the public web, to catch uploads that weren't the contributor's own. Google `WEB_DETECTION` is already in the stack.
3. **Label:** the vision-model "does this photo match this pin title?" audit, which caught 4/25 wrong images before (`pinhunt-images.md`).
4. **Human review** in the existing queue. Once a contributor has ~25 approved photos with no rejections, they can be promoted to **spot-check review** (e.g. 1 in 10 sampled), with the right to demote them.

### 4.6 Recognition and rewards (non-cash first)
- A "Founding Collector" profile badge, numbered by join order.
- Opt-in photo credit on pin pages.
- Per-set contributor credits ("photographed by…").
- Early access to the recognition scan.
- A trusted-status fast lane.
- Optional for later: a perk such as a premium tier, if one ever exists. Don't add cash bounties unless the solicitor and the business model support them.

### 4.7 Scale maths (ASSUMPTION)
- 100 active collectors × about 30 pins each × 3–5 photos = **3k pins, 10–15k photos**.
- The bottleneck is **review time**, not supply. At 30 s per photo, 15k photos is about 125 admin-hours. Spot-check promotion (4.5) is therefore what makes the programme scale.

### 4.8 Things that need explicit approval later (none are queued)
- consent v2 and the Founding Collector agreement in the app
- the rights-model migration (README §3)
- keeping raw photos privately
- the extra-shots capture UI
- the withdrawal and deletion path
- the provenance check

Each is a separate change under the normal approval rules.

---

## 5. UK legal position: open questions, not answers

Sources are web-search extracts only. A solicitor must verify each point.

### 5.1 The pin artwork
A pin's enamel design is almost certainly a **graphic work** (CDPA s4) embodying Disney character artwork. ANALYSIS. Whether the 3D pin is also a sculpture is narrower after *Lucasfilm v Ainsworth* [2011] UKSC 39, but it doesn't matter: every photo reproduces the 2D artwork. Reproduction includes **storing a work in any medium by electronic means** (s17(2)) and **transient copies** (s17(6)). ANALYSIS.

**So the clearest exposure is the stored photo corpus, whoever the photographer is**, not the vectors.

### 5.2 Exceptions: none clearly fits

| Exception | Position |
|---|---|
| s29A TDM | Non-commercial research only. CONFIRMED (secondary). **Not available to PinHunt.** |
| s28A temporary copies | Requires a transient or incidental copy that is integral to a technological process, made solely to enable a lawful use, with no independent economic significance ([s28A](https://www.legislation.gov.uk/ukpga/1988/48/section/28A); *PRCA v NLA* [2013] UKSC 18). CONFIRMED. *For:* the image held in memory during embedding. *Against:* it doesn't cover the persisted dataset, the "lawful use" limb is circular if the use is unlicensed, and a recognition product gives the copies economic significance. ANALYSIS. |
| s31 incidental inclusion | Doesn't apply when the artwork is the subject (*FAPL v Panini* [2003] EWCA Civ 995). ANALYSIS. |
| s30A pastiche, s62 | Don't apply to faithful catalogue shots or portable objects. ANALYSIS. |

### 5.3 Is an embedding a copy of a substantial part? Unsettled
- **Against:** a 768–1,024-dimension vector is lossy, non-perceivable and statistical. In *Getty Images v Stability AI* [2025] EWHC 2863 (Ch), model weights that never stored the works were not an "infringing copy". CONFIRMED (commentary).
- **For:** a **per-image** embedding is far closer to one specific work than diffuse model weights. Inversion research reconstructs images from CLIP embeddings ([LeakyCLIP](https://arxiv.org/abs/2508.00756)). Getty was a **secondary-infringement** case. **No UK court has decided whether computing an embedding is a primary reproduction.** ANALYSIS.
- **Moving target:** the Court of Appeal granted permission to appeal in Getty ([IPKat](https://ipkitten.blogspot.com/2026/01/permission-to-appeal-granted-in-getty.html)). CONFIRMED. A hearing is reported for 10 Nov 2026 by a single, unverified source.

### 5.4 Policy
- The Dec 2024 consultation drew 11,520 responses.
- The Data (Use and Access) Act 2025 required reports. The s135–136 report and impact assessment were published **18 March 2026** ([gov.uk](https://www.gov.uk/government/publications/report-and-impact-assessment-on-copyright-and-artificial-intelligence/report-on-copyright-and-artificial-intelligence)). The commercial TDM opt-out exception is "no longer the Government's preferred way forward". CONFIRMED (gov.uk URL and law-firm summaries).
- **There is no statutory safe harbour in 2026.**

### 5.5 Photographer copyright may be thin
- Originality requires free and creative choices (*THJ v Sheridan* [2023] EWCA Civ 1354). CONFIRMED (commentary).
- UKIPO guidance says faithful reproductions of 2D works are unlikely to be original. CONFIRMED (secondary); re-check the current gov.uk text.
- **Implication (ANALYSIS):** flat, white-background product shots, like PinPics' house style and Pixian output, may carry little photographer copyright. Licences from photographers and archives then buy mainly **contractual permission, database-right clearance, warranties and goodwill**, not much copyright. Styled or angled collector photos carry more. **The real licence gap is Disney's artwork in every case.**

### 5.6 Other layers

| Layer | Position |
|---|---|
| **Database right** | Protects substantial investment in obtaining, verifying or presenting data (*BHB v William Hill*, *Football Dataco*). CONFIRMED (secondary). Community archives like PinPics likely qualify, so a licence must cover extraction as well as images. ANALYSIS. |
| **Contract** | Site terms can bind even unprotected data (*Ryanair v PR Aviation*). CONFIRMED (commentary). Disney's UK AI/TDM reservation ([example](https://www.thelionking.co.uk/ai-opt-out)) mainly signals intent, because the UK has no opt-out regime. ANALYSIS. We never scrape, so this matters most for any future fetch-based ingestion. |
| **Trade marks** | Naming pins to identify genuine goods is referential use (TMA s11(2)(c), with an honest-practices proviso; s12 exhaustion for resale). Avoid Disney logos and implied endorsement; keep a "not affiliated" notice. ANALYSIS. |
| **UK GDPR** | Pin embeddings aren't built to identify people, so they're unlikely to be special category data ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/guidance-on-biometric-data/key-data-protection-concepts)). CONFIRMED (ICO). Photos with faces, hands or EXIF location are still personal data. Crop to the pin, strip EXIF, and make deletion cascade to vectors. ANALYSIS. |
| **Enforcement history** | No Disney action against pin databases or fan sites was found. Fan databases and marketplaces display pin photos widely. **Not finding any is not evidence of tolerance or of a licence.** |

### 5.7 Risk spectrum (ANALYSIS)
1. **Lowest risk:** our own or contributor photos, embedded privately. Scan results show text plus our own displayed image, or no image.
2. **Middle:** licensed third-party archives embedded privately, with no display.
3. **Higher:** publicly displaying contributor photos of Disney pins. **The app does this today** through the contribution flow and, if CTP images were imported, through those too. It is common practice, but technically needs a defence. Have a notice-and-takedown process.

### 5.8 Questions for a UK IP solicitor
1. Is computing **and** storing a per-image embedding of a photo of Disney artwork a reproduction of a substantial part? Does s28A cover the in-memory step?
2. What is our exposure from persistently storing the source photo corpus for a commercial recognition feature, and is any defence available? How does that change for flat product shots with thin photo copyright?
3. How should we position for the Getty v Stability Court of Appeal outcome?
4. Is public display of contributor photos defensible (referential use, hosting safe harbour)? What takedown process do we need?
5. Contributor agreement: what warranties and indemnities are needed? Do withdrawals have to reach already-trained models?
6. PinPics / CTP deals: is a sub-licence plus database-right licence enough? What warranties cover pre-2021 or user-submitted photos?
7. **Collectible PinTrader specifically:** does its terms grant to Collectible Apps ("use and modify … in perpetuity for whatever purposes") support a sub-licence to PinHunt, and is our current public display of CTP images covered?
8. GDPR: is a DPIA needed? What lawful basis applies to user photos and derived vectors?

---

## 6. Recommended next steps (none actioned)

| # | Step | Owner |
|---|---|---|
| 1 | **Fill the CTP evidence record** (`collectible-pintrader-rights.md`) and ask the developer, in writing, for (a) the CC variant, (b) embedding permission, (c) confirmation that they can sub-license user-submitted images. | Maintainer, existing contact |
| 2 | Brief a UK IP solicitor with §5.8, before spending on archive licences. | Maintainer |
| 3 | Read PinPics' full terms from an unrestricted network. If they match the snippet, send an enquiry to info@pinpics.com for an **internal, non-display embedding + extraction licence** covering 2015–2026 and all DLP. Ask what share of photos are original and which terms version covers each era. | Maintainer |
| 4 | Contact Samra's Pins, Stewpins and dlppins about a small per-image licence for photos **they took**. | Maintainer |
| 5 | Pass the DLP catalogue gap (§1) to the catalogue workstream as an input, outside this research and the sprint. | Maintainer |
| 6 | Approve Wave 0 of the Founding Collector programme (the offline pilot in `README.md` §5). | Maintainer |

# Licensing, photos and open data: findings (2026-10-14)

> **This is research, not legal advice.** It summarises search-result snippets, mostly from secondary sources (affiliate directories, law-firm blogs, fan sites). Before acting on anything here that carries legal risk, ask a UK IP solicitor to confirm it.

Extends [`source-access.md`](./source-access.md). That file covers per-host access, Disney ToU scraping clauses and the CJ affiliate lead, and is not repeated here.

## Method and limits
- WebSearch only (35 searches, standard mode). Direct page reads are blocked by the network policy, so no licence or terms page was read in full.
- **CONFIRMED** means a search result states the point. It does **not** mean a primary source was read; most points come from secondary pages.
- **UNCONFIRMED** means it is inference, background knowledge, or a point the sources disagree on.

---

## 1. Official affiliate and product feeds

| Retailer | Network(s) | Product feed | Status |
|---|---|---|---|
| shopDisney US / Disney Store | CJ Affiliate, around 2% commission, 30-day cookie. FlexOffers also lists it. One directory also lists Rakuten Advertising. | affpaying says a product feed is available. | CONFIRMED (secondary): CJ and the feed. UNCONFIRMED: Rakuten, current terms. |
| Disney Store UK (disneystore.co.uk) | CJ (Affilitizer: "CJ, active since 08.05.2024"). Commission and cookie figures conflict (2%/10 days vs 30 days). | No UK feed details found. | CONFIRMED (secondary): CJ. UNCONFIRMED: feed. |
| Disney Store EU (FR/DE/IT/ES) | affi.io lists shopDisney IT and ES on **Awin, both closed**. No FR/DE programme found. | Not found. | CONFIRMED (secondary): IT/ES closed on Awin. UNCONFIRMED: everything else. |
| Loungefly | FlexOffers (1.6%, 30 days). affi.io also lists CJ, Sovrn Commerce and BlueAff. | Not found. | CONFIRMED (secondary): networks. UNCONFIRMED: feed. |
| Funko | US: FlexOffers (3.2%) and CJ (2%). UK: Awin and FlexOffers. | Not found. | CONFIRMED (secondary): networks. UNCONFIRMED: feed. |
| Hot Topic / BoxLunch | CJ, about 1% per sale. No Rakuten or Impact found. | Not found. | CONFIRMED (secondary): CJ. UNCONFIRMED: feed. |

**Typical feed fields.** CJ-style feeds carry ID/SKU, title (NAME), description, BUYURL (landing link), image URL, PRICE / RETAILPRICE / SALEPRICE, AVAILABLE (yes/no stock flag) and category. They come as CSV, pipe- or tab-delimited, or XML. A header holds CID, SUBID, process type and AID. CONFIRMED (vendor pages: Feedonomics, Pricefy). CJ's own spec is reportedly a 36-page PDF, not seen.

**Licence restrictions.**
- Feed-use rules are usually set **per advertiser**, on top of the network agreement. CONFIRMED by Awin advertiser terms:
  - The Outlet Shop and Very forbid using their feeds on Google Shopping.
  - Ideal World and Sensilab forbid using the feed outside the publisher's own website or on third-party platforms.
- Awin's documentation describes feeds as a way for publishers to "promote products on your site". CONFIRMED.
- A Disney affiliate guideline document requires CJ trackable links for "all promotional activities". CONFIRMED (secondary snippet).
- The current CJ Publisher Service Agreement's feed clause was not found. UNCONFIRMED.
- Industry norm (UNCONFIRMED for Disney specifically): feed data is licensed **only to promote the advertiser's products with tracked links**. The licence usually ends when you leave the programme, and data is often required to be refreshed or deleted. This makes it unlikely to permit any of these:
  - storing feed data permanently in an independent catalogue
  - showing it without an affiliate link
  - redistributing it as open data
  - using feed images as catalogue images

**Recommendation.**
- Treat affiliate feeds as **a reference and "buy" links only**. Never treat them as a source for the published catalogue.
- Use a feed to *check* facts a person has recorded (name, SKU, price, release window). Store only PinHunt's own record plus a note that "verified against retailer listing on date X". Store no feed text or images.
- Get written confirmation from the CJ advertiser (Disney Store UK/US) before even this use.
- Do not mix feed-derived fields into any dataset PinHunt publishes under an open licence.

Sources: [affpaying shopDisney](https://www.affpaying.com/shopdisney) · [linkclicky shopDisney](https://linkclicky.com/affiliate-program/shopdisney/) · [FlexOffers shopDisney](https://www.flexoffers.com/affiliate-programs/shopdisney-affiliate-program/) · [Affilitizer disneystore.co.uk](https://www.affilitizer.com/programs/disneystore.co.uk) · [uppromote Disney Store](https://uppromote.com/affiliate-program-directory/disney-store) · [affi.io shopDisney](https://affi.io/m/shopdisney) · [affsignal Disneystore](https://affsignal.com/merchant/Disneystore) · [Disney affiliate guideline doc](https://docs.google.com/document/d/1_Sf7pdG14ZRB51dot8nEEc3aObG4XYfK/export?format=pdf) · [FlexOffers Loungefly](https://www.flexoffers.com/affiliate-programs/loungefly-affiliate-program/) · [affi.io Loungefly](https://affi.io/m/loungefly) · [FlexOffers Funko US](https://www.flexoffers.com/affiliate-programs/funko-us-affiliate-program/) · [FlexOffers Funko UK](https://www.flexoffers.com/affiliate-programs/funko-uk-affiliate-program/) · [linkclicky Funko](https://linkclicky.com/affiliate-program/funko/) · [linkclicky Hot Topic](https://linkclicky.com/affiliate-program/hot-topic/) · [linkclicky BoxLunch](https://linkclicky.com/affiliate-program/boxlunch/) · [getlasso BoxLunch](https://getlasso.co/affiliate/boxlunch/) · [Feedonomics CJ](https://feedonomics.com/?p=2890) · [Pricefy CJ](https://www.pricefy.io/feed-channels/cj-affiliate) · [Awin: The Outlet Shop terms](https://ui.awin.com/merchant-profile-terms/100067/brand) · [Awin: Ideal World terms](https://ui.awin.com/merchant-profile-terms/114126) · [Awin: Sensilab terms](https://ui.awin.com/merchant-profile-terms/24206) · [Awin publisher feed docs](https://help.awin.com/developers/docs/product-feed-publisher.md)

---

## 2. Licensed or open datasets

- **No official or licensed Disney pin data API or provider was found.** CONFIRMED (absence in results).
  - The results showed only consumer apps:
    - Pin Trading – Scan & Collect, which claims 130,000+ pins
    - PinLore, which draws values from eBay listings
    - MagicPin, which states it is not affiliated with Disney
  - None of them offers a public API or claims a Disney licence. Their data provenance is unknown, so **do not use them**.
- **Wikidata.** Structured data in the item, property and lexeme namespaces is **CC0**, and contributors apply CC0 as a condition of contributing. CONFIRMED.
  - No Wikidata coverage of individual Disney pins was found. UNCONFIRMED (a SPARQL query, which is a human or network-enabled task, would settle it).
  - Wikidata is useful as a CC0 source for **character, film, park and land entities and IDs**. It is not a source of pin records.
- **Fandom wikis.**
  - Text is **CC BY-SA 3.0 Unported** by default, and some wikis use other licences. Reuse requires attribution (a link to the article or history) and the licence named. CONFIRMED.
  - Images are **not** covered by the default licence: Commons guidance says Fandom media should be presumed copyrighted, and Fandom does not verify licences. CONFIRMED (secondary).
  - Compatibility: share-alike means any database or text built from Fandom prose would have to be released CC BY-SA. That conflicts with a CC0 or proprietary catalogue. UNCONFIRMED (interpretation).
  - Bare facts taken from a wiki (a pin's name and release date) are not copyright. In the EU/UK, though, the database right may still apply to a substantial extraction (see §3).
- **Barcode/GTIN data.** GS1 UK runs a registry with GTIN Check and productDNA services; terms were not found. Commercial UPC/EAN APIs exist (UPCDatabase, EAN-Search), but their licences and Disney coverage are unknown. No free, complete barcode database exists. CONFIRMED (secondary). Use only to check a barcode on a pin card someone has in hand.

**Recommendation.**
- Use Wikidata (CC0) for character, film and park reference IDs, and store the QID as a provenance link.
- Do not import pin records from Fandom or any fan database. If someone wants Fandom text, keep it out of the core dataset.
- Build pin records from first-hand evidence: the pin in hand, the backing card, or a photo of the receipt.

Sources: [Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) · [Fandom Licensing](https://www.fandom.com/Licensing) · [Fandom Help:Licensing](https://community.fandom.com/wiki/Help:Licensing) · [Pin Trading app](https://apps.apple.com/us/app/id6751493504) · [PinLore](https://mwm.ai/apps/app/6770895298) · [MagicPin press release](https://business.minstercommunitypost.com/minstercommunitypost/article/prleap-2021-8-4-identify-organize-buy-sell-and-trade-disney-collectible-pins-with-the-new-app-magicpin) · [GS1 UK product identification](https://gs1uk.org/knowledge-hub/product-identification) · [WisePIM UPC lookup](https://wisepim.com/tools/upc-lookup)

---

## 3. UK and EU law for building and publishing a catalogue

**3.1 Facts and copyright.**
- Database copyright protects only an original *selection or arrangement*, meaning "free and creative choices". Effort in creating the data does not count, and rule-dictated compilations fail. CONFIRMED (CJEU *Football Dataco v Yahoo*, C-604/10).
- The UK test also requires "free and creative choices" and a personal touch; skill and labour alone no longer suffice. CONFIRMED (*THJ v Sheridan* [2023] EWCA Civ 1354 commentary).
- So individual facts are free to use: pin name, character, set, edition size, release date, park, price. CONFIRMED in the sense that the sources say the database right does not cover individual facts.
- **Descriptions are different.** Even an 11-word extract can be protected if it shows the author's creativity (CJEU *Infopaq*, C-5/08). CONFIRMED. **Never copy retailer or fan-site descriptions.** Write new ones.

**3.2 Database right (sui generis).**
- The UK right comes from the Copyright and Rights in Databases Regulations 1997. It needs substantial investment in *obtaining, verifying or presenting* contents, and lasts 15 years, renewed by substantial new investment. It forbids extracting or re-using all or a **substantial part**, and **repeated, systematic taking of insubstantial parts**. CONFIRMED.
- After Brexit, UK and EEA rights are separate. New EEA databases do not get UK protection, and the reverse also holds; rights from before 2021 continue. CONFIRMED (law-firm guides).
- *BHB v William Hill* (CJEU C-203/02; [2005] EWCA Civ 863): investment in *creating* data does not count, only investment in obtaining existing materials. CONFIRMED.
  - Implication (UNCONFIRMED): a fan database such as PinPics is built by *collecting* existing pin information, so it probably **does** attract the right.
  - Systematically copying many of its records, even field by field, would be the kind of taking the right forbids.
  - Recording facts independently from your own sources does not infringe, even if the results match.
- *Ryanair v PR Aviation* (CJEU C-30/14): where no database right or copyright applies, a site's **terms of use can still forbid scraping by contract**. CONFIRMED. This is why the Disney ToU anti-scraping clause in `source-access.md` matters even for bare facts.

**3.3 Product photographs and press images.**
- Photographing a copyright object is reproduction, and toys and applied art can be protected. CONFIRMED (WIPO).
  - A pin's design (character art) is Disney's artistic work, so **a photo of a pin contains two copyrights**: the photographer's and Disney's. Commons applies this to a Pooh toy. CONFIRMED (Commons:Derivative works).
- The UK freedom-of-panorama exception (s.62 CDPA) covers buildings, sculptures and works of artistic craftsmanship on permanent public display, **not 2D graphic works**. Incidental inclusion (s.31) is read narrowly, and deliberately photographing a work is not incidental. CONFIRMED (blogs).
- s.63 CDPA allows copying an artistic work **to advertise the sale of that work**, and any other later use infringes. CONFIRMED (legislation.gov.uk, DACS). This may cover a member's trade or sale listing for their own pin, but **not** a permanent catalogue image. UNCONFIRMED; ask a solicitor.
- Retailer product shots and press images belong to the retailer, Disney or the photographer.
  - Disney News Rooms terms are aimed at registered press and journalists; the reuse clause's conditions were cut off in the snippet. CONFIRMED (partial).
  - Agency DLP images are "editorial use only". CONFIRMED (Getty).
  - **Do not use them as catalogue images.**
- Plain product shots may fail the originality test under *THJ*. That is an inference, not a source finding (UNCONFIRMED), and should not be relied on.

**3.4 Trade marks: naming Disney.**
- s.11(2)(c) TMA 1994 (amended 14 Jan 2019 by SI 2018/825) allows use of a mark to identify or refer to goods as those of the proprietor, if it follows honest practices. CONFIRMED (the amendment; its full text was not seen).
- *BMW v Deenik* (C-63/97): referential use is allowed if it does not suggest a commercial connection. CONFIRMED.
- *BMW v Technosport*: the BMW **word** did not infringe, but the **roundel and M logo** did. CONFIRMED.
- Implication (UNCONFIRMED):
  - Using "Disney", character names and park names in text to *describe* a pin is referential use.
  - **Disney logos, castle iconography and official artwork should be avoided.**
  - The catalogue should carry a clear "unofficial, not affiliated with or endorsed by Disney" statement.
  - One domain-dispute panel accepted a Disney fan site as legitimate use. CONFIRMED, but it is a single non-binding decision.

**Recommendation.** Build the catalogue as **independently recorded facts plus original text**. Rules:
- No systematic copying from any third-party database.
- No retailer or press images.
- Disney names in plain text only, with no logos.
- A non-affiliation disclaimer.
- Keep provenance on every field so independence can be shown if challenged.

Sources: [Football Dataco (SCL)](https://www.scl.org/2407-football-dataco-no-database-copyright-protection-for-fixture-lists/) · [IPPT Football Dataco](https://www.ippt.eu/items/ippt20120301-cjeu-football-dataco-v-yahoo) · [Infopaq (Pinsent Masons)](https://www.pinsentmasons.com/out-law/news/eleven-word-snippets-can-infringe-copyright-rules-ecj) · [BHB v William Hill (Pinsent Masons)](https://www.pinsentmasons.com/out-law/guides/british-horseracing-board-v-william-hill) · [BHB (SCL)](https://www.scl.org/781-court-of-appeal-cuts-back-the-legal-protection-for-databases/) · [Sprintlaw database right](https://sprintlaw.co.uk/articles/understanding-sui-generis-database-rights-in-the-uk/) · [Womble Bond Dickinson Brexit](https://www.womblebonddickinson.com/uk/insights/articles-and-briefings/brexit-and-database-rights) · [BCLP](https://www.bclplaw.com/en-GB/insights/protecting-your-investment-in-databases-created-in-the-uk-or-the-eu-during-the-transition-period-and-afterwards.html) · [Ryanair v PR Aviation](https://www.pinsentmasons.com/out-law/news/website-operators-can-prohibit-screen-scraping-of-unprotected-data-via-terms-and-conditions-says-eu-court-in-ryanair-case) · [THJ v Sheridan (CILIP)](https://www.cilip.org.uk/news/662926/Copyright-The-demise-of-skill-labour-and-effort-.htm) · [Museums Association](https://www.museumsassociation.org/museums-journal/opinion/2024/02/how-does-a-recent-landmark-ruling-change-museums-understanding-of-copyright/) · [WIPO photos of copyright works](https://www.wipo.int/wipo_magazine/en/2006/02/article_0010.html) · [Commons:Derivative works](https://commons.wikimedia.org/wiki/Commons:Derivative_works) · [s.63 CDPA](https://www.legislation.gov.uk/ukpga/1988/48/section/63) · [DACS exceptions](https://dacs.ten4dev.com/advice/articles/copyright-infringement/other-exceptions) · [s.62/s.31 (ipcopy)](https://ipcopy.blog/2014/11/05/copyright-works-in-photographs-photographing-buildings) · [Disney News Rooms terms](https://disneyexperiences.com/disneyland-press/?p=7409) · [Getty DLP editorial](https://www.gettyimages.com/detail/news-photo/5th-anniversary-of-disneyland-paris-news-photo/667955836) · [TMA s.11](https://www.legislation.gov.uk/ukpga/1994/26/section/11) · [BMW v Deenik](https://www.ippt.eu/sites/ippt/files/1999/IPPT19990223_ECJ_BMW_v_Deenik.pdf) · [BMW v Technosport](https://legalblogs.wolterskluwer.com/trademark-blog/uk-bmw-cross-the-line-first-in-trade-mark-infringement-case-against-unauthorised-repair/) · [NAF Disney fan-site decision](https://www.adrforum.com/DomainDecisions/1423230.htm)

---

## 4. Original, reusable pin photographs

**4.1 PinHunt's own photography of owned pins.**
- PinHunt owns the copyright **in the photo**. The photo still reproduces Disney's design (§3.3), so it cannot be released as truly "free" content.
- Wikimedia Commons would treat it as a derivative work and refuse it. CONFIRMED (Commons:Derivative works).
- In practice (UNCONFIRMED): pin collector sites and resale marketplaces routinely show photos of pins, and the realistic risk is a takedown request rather than a claim. Reduce the risk by:
  - using photos only to identify the pin
  - showing them only inside the app or site
  - never selling or licensing them as images
  - keeping them out of any open-data release
  - having a fast takedown process
- Use a consistent house style: neutral background, front and back, backstamp visible, scale reference. This makes photos useful for identification and avoids the look of Disney's marketing images.

**4.2 Community and user submissions.** How comparable services handle it:

| Service | Licence model | Status |
|---|---|---|
| iNaturalist | The contributor picks the licence for each photo. The default is **CC BY-NC**; CC BY and CC0 are options; "all rights reserved" is allowed. In Jan 2024: 52% CC BY-NC, 47% all rights reserved, 0.28% CC BY, 0.15% CC0. GBIF accepts only CC0, CC BY and CC BY-NC. | CONFIRMED |
| Discogs | Database text is CC0. **Images are "Restricted Data"**: not CC0, and uploaders must have rights (own photo, public domain, CC0, or fair use). | CONFIRMED |
| BoardGameGeek | Upload only photos you took yourself or have explicit permission for, with the permission credited in the caption. Covers must be scans of your own copy. No watermarks or branding. The licence granted to BGG was not found. | CONFIRMED (policy); UNCONFIRMED (grant) |
| Wikimedia Commons | Free licences only: CC0, CC BY, CC BY-SA. **No NC or ND.** Derivative works of copyright objects are refused. | CONFIRMED |

- Typical platform grant wording is "non-exclusive, worldwide, royalty-free" (sometimes "perpetual, irrevocable, transferable"), and the contributor keeps ownership. CONFIRMED (Adobe Stock, Canon UGC terms).
- Contributor-friendly terms (Columbia Kernochan Center) limit the scope and allow removal. CONFIRMED.

**4.3 Photography in Disney parks.**
- Disney US parks allow personal photos. Commercial photography, photography that inconveniences other guests, and public transmission are not permitted without arrangement. CONFIRMED (2024 notice quoted by Inside the Magic; Disneyland policy via fan sites).
- Disneyland Paris bans equipment used for commercial, journalistic or promotional filming or photography. It also bans professional cameras, lenses over 135 mm, supports over 20 cm, lighting, handheld microphones and drones. CONFIRMED (fan sites, 2025–26).
- A 2023 report quotes DLP rules saying guest images are for personal use only. UNCONFIRMED whether that wording is still current.
- **Conclusion:** do not commission or ask for photos taken in the parks (including pin boards and shop displays) for the catalogue. Photograph pins at home.

**Recommendation.**
- Primary image source: photos the PinHunt team takes of pins it owns or borrows, at home.
- Secondary source: member uploads, under an explicit upload agreement that says:
  1. the member took the photo themselves (no screenshots, retailer images or other people's images);
  2. the member grants PinHunt a non-exclusive, worldwide, royalty-free, perpetual licence to host, display, crop and resize the photo to identify pins in the catalogue, and to sublicense it to service providers;
  3. optionally, the member can tick to also release their *photographic* contribution as CC BY 4.0, clearly stating that the pin design remains Disney's;
  4. the member is credited by display name;
  5. there is a takedown route.
- Keep a record for each image: uploader, date, statement accepted, original EXIF, and perceptual hash.
- Consider an image-similarity check against known retailer and press images to catch re-uploads.
- No in-park photography for catalogue use.

Sources: [iNaturalist licences help](https://help.inaturalist.org/en/support/solutions/articles/151000173511) · [iNaturalist default licences Jan 2024](https://inaturalist.laji.fi/posts/88222-default-image-licenses-jan-2024) · [iNaturalist forum](https://forum.inaturalist.org/t/a-case-for-changing-the-default-license-to-not-include-a-nc-clause/18690/86) · [Discogs API Terms](https://support.discogs.com/hc/en-us/articles/360009334593) · [BGG Image Policy](https://boardgamegeek.com/wiki/page/BGG%20Image%20Policy) · [BGG General Image Policy](https://boardgamegeek.com/wiki/page/General_Image_Policy) · [Commons:Licensing](https://commons.wikimedia.org/wiki/Commons:Licensing) · [Columbia UGC clauses](https://kernochan.law.columbia.edu/content/clauses-user-generated-content-submissions) · [Adobe Stock contributor terms](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe_Stock_Contributor_Agreement_Addl_Terms_en_US_20240216.pdf) · [Canon UGC terms](https://www.canon.co.uk/campaigns/free-your-story/terms-and-conditions.html) · [Inside the Magic 2024 notice](https://insidethemagic.net/2024/04/disney-sweeping-change-notice-active-ad1/) · [Disneyland camera policy](https://disneyparknerds.com/disneyland-camera-policy/) · [DLP equipment ban](https://mickeyfromthe.uk/news/disneyland-paris-prohibits-professional-camera-equipment-and-more) · [DLP camera rules](https://dlptips.com/disneyland-paris-camera-rules-tripods-selfie-sticks-filming/) · [ITM 2023 DLP](https://insidethemagic.net/2023/11/disneyland-paris-onlyfans-creator-takes-over-jc1/) · [Theme Park Insider 2014](https://www.themeparkinsider.com/flume/201409/4230)

---

## 5. Publishing independently sourced metadata

**Licence options.**

| Licence | Pros | Cons |
|---|---|---|
| **CC0** | Maximum reuse. Waives copyright **and** database right. Used by Wikidata, MusicBrainz core and Discogs dumps. Lets PinHunt data flow into Wikidata. | No attribution required, so competitors can absorb the data without credit. Cannot be withdrawn. One Wikimedian essay argues it is a poor fit for crowd-sourced content. |
| **CC BY 4.0** | Requires attribution. 4.0 explicitly licenses **sui generis database rights**, so attribution applies even to fact-only extraction, but only where those rights exist. Allows text and data mining. Widely understood. | Attribution cannot be enforced where no right exists. Cannot be imported into Wikidata, which takes CC0 only. |
| **ODbL 1.0** (OpenStreetMap) | Share-alike for databases: a public derived database must be shared back. Enforced through copyright, database right **and contract**. | Strong copyleft puts off commercial partners. Complex. Mixing with other licences is awkward. |

All CONFIRMED except the "puts off commercial partners" point (UNCONFIRMED).

**Provenance models.**
- MusicBrainz has **core data CC0** and **supplementary data** (annotations, tags, ratings, edit history) **CC BY-NC-SA 3.0**, with commercial licensing through MetaBrainz. CONFIRMED.
- Discogs makes **release metadata CC0** (titles, notes, dates, formats, identifiers, credits) and treats **images as restricted**, outside CC0. CONFIRMED.
- Both keep edit histories and source notes per record. CONFIRMED for MusicBrainz edit history; details UNCONFIRMED.

**What must NOT be published.**
- Third-party images: retailer and product shots, press images, fan-database scans, eBay listing photos.
- Copied descriptions or marketing text, even short extracts (*Infopaq*).
- Any field taken from an affiliate feed (licence restrictions, §1).
- Bulk or systematic extractions from fan databases or retailer sites (database right, §3.2; contract, *Ryanair*).
- Fandom text in a CC0 or proprietary set (CC BY-SA share-alike).
- Disney logos or official art. Member photos unless the member opted in to an open licence, and even then the photo should not be presented as freeing the pin design.
- Personal data: member names on provenance records unless they agreed to be credited, and owner or location data.

**Recommendation.**
- Do not publish an open dataset until the catalogue's provenance is clean. When ready, use the MusicBrainz/Discogs split:
  - **Core pin facts** (PinHunt ID, name, characters, set, edition type and size, release date, origin park or store, backstamp text, Wikidata QIDs) under **CC0**, or **CC BY 4.0** if the maintainer wants credit. CC BY 4.0 is the cautious default: it can later be relaxed to CC0, but the reverse is impossible.
  - **Images** stay "all rights reserved / restricted" and are excluded from dumps.
  - **Valuations, community annotations and trade data** stay proprietary.
- Keep a `source`/`evidence` record on every field (for example: "own pin in hand", "backing card photo", "retailer listing seen on <date>", "Wikidata Qxxx"). Publish only fields whose evidence is first-hand or CC0.
- Add a non-affiliation statement and a contact for corrections and takedowns.

Sources: [MusicBrainz database licence](https://musicbrainz.readthedocs.io/en/latest/musicbrainz_database/index.html) · [Discogs API Terms](https://support.discogs.com/hc/en-us/articles/360009334593) · [CC 4.0 and database rights](https://wiki.creativecommons.org/4.0/Sui_generis_database_rights) · [CC Version 4](https://wiki.creativecommons.org/wiki/Version_4) · [OKF blog on CC 4.0 data](https://blog.okfn.org/?p=11224) · [CASRAI CC0 vs CC BY](https://casrai.org/news/cc0-vs-cc-by) · [OSM ODbL legal structure](https://wiki.openstreetmap.org/wiki/Open_Data_License/Legal_Structure) · [OSM legal-talk ODbL vs CC BY-SA](https://lists.openstreetmap.org/pipermail/legal-talk/2010-September/004448.html) · [Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) · [Meta: On CC0 essay](https://meta.wikimedia.org/wiki/User:Amgine/On_CC0)

---

## What needs the maintainer
1. **Affiliate feeds:** apply to Disney Store UK/US on CJ, and Loungefly, Funko, Hot Topic and BoxLunch where relevant. Ask each advertiser in writing whether feed data may be used to *check* catalogue facts and whether any field may be stored. Do not ingest feeds until they answer.
2. **Solicitor review** (UK IP) of:
   - (a) in-app display of photos of Disney-designed pins
   - (b) whether s.63 CDPA covers member trade and sale listings
   - (c) the non-affiliation disclaimer and use of Disney names
   - (d) the member photo-upload licence text
   - (e) the open-data licence choice
3. **Decide the open-data stance:** CC0 vs CC BY 4.0 vs no publication yet, and which fields count as "core".
4. **Approve a member upload agreement and takedown process** (wording in §4) before community photo uploads go live.
5. **Approve a provenance field** on catalogue records (a schema change; migrations are hand-written and applied manually).
6. **Confirm no records came from PinPics, Pin & Pop, PinTradingDB or Fandom.** If any did, flag them for re-sourcing.
7. **Optional:** allow `query.wikidata.org` in network settings so Wikidata pin and character coverage can be checked by SPARQL.

## Open questions (UNCONFIRMED)
- Whether a shopDisney or Disney Store product feed exists in the UK programme, and its exact licence.
- The exact conditions in the CJ Publisher Service Agreement and Disney News Rooms reuse clauses.
- Whether Wikidata already has any Disney pin items.
- Whether current DLP rules still limit guest images to "personal use".

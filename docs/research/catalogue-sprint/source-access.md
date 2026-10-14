# Unlocking direct source access: findings (2026-10-14)

## Method and limits
- Search results only. Direct page reads from the research environment are still refused by the network policy, so no site's own Terms of Use page or robots.txt could be read.
- Everything below is either cited to a secondary source or marked unknown.
- **No host's access policy has changed.** `access_policy.json` stays deny-by-default.

## Network
Every target host is refused from the cloud environment. Retested 2026-10-14:
- `curl` gets a CONNECT 403 from the proxy.
- The page-fetch tool fails with a DNS error.

To enable a host, the maintainer adds it under **Environment → Edit → Network access → Allowed domains**: <https://code.claude.com/docs/en/cloud-environments#network-access>. Network access alone does **not** permit fetching. The terms and robots checks below must also pass, and be recorded in `access_policy.json`.

## Per host
| Host | Automated access | Robots | Permitted routes | Recommendation |
|---|---|---|---|---|
| disneystore.co.uk, shopdisney.com, disneystore.com | Likely covered by the Disney Terms of Use. A third-party tracker cites a clause prohibiting robots, spiders, scraping and data mining. A Disney UK "AI opt-out" page says text and data mining needs a written licence. Which version applies to the stores is unconfirmed. | unknown | The Disney Store affiliate programme on CJ Affiliate (GB and US) reportedly includes a product feed. | **Feed or licence.** No automated page reads. |
| disneyparks.disney.go.com, disneyworld…, disneyland… | Probably the same Disney Terms of Use. Wording unconfirmed. | unknown | Parks Blog RSS is likely (URL unverified). Official press rooms (disneyexperiences.com) exist. | Parks Blog: **feed**. Booking sites: **manual human check only**. |
| disneylandparis.com, news.disneylandparis.com | Legal notice not found. | unknown | Press site exists. Feed unconfirmed. | **Manual human check only** until the legal notice is read. |
| loungefly.com (Funko) | Not found. | unknown | None found. | **Manual human check only.** Ask Funko or Loungefly for a data feed. |
| wdwnt.com, laughingplace.com, dlpreport.com, ed92.org, insidethemagic.net | Independent sites; terms not found. | unknown | RSS exists for some (LaughingPlace nav; WDWNT podcast). | **Fetch after check:** read terms and robots first, prefer RSS, low rate, facts only. |

Sources: [ConductAtlas: Disney ToU automated-access clause](https://conductatlas.com/platform/disney/disney-terms-of-use/provision/CA-P-022520/prohibition-on-automated-access-and-ai-scraping/) · [Disney UK AI opt-out](https://www.thelionking.co.uk/ai-opt-out) · [affpaying: shopDisney affiliate](https://www.affpaying.com/shopdisney) · [affilitizer: disneystore.co.uk](https://www.affilitizer.com/programs/disneystore.co.uk) · [Disneyland press releases](https://disneyexperiences.com/disneyland-press/releases/) · [WDWNT about](https://wdwnt.com/about)

## Human next steps, in order of value
1. **Read the Disney terms that apply to each store and parks host.** Use the footer link on each site and disneytermsofuse.com. Assume Disney hosts prohibit automated access until the terms show otherwise. This means Disney pages are verified **by a person** in Research Review, which is what set-level verification speeds up.
2. **Apply to the Disney Store UK and US affiliate programmes (CJ).** Ask whether the product feed licence allows non-promotional catalogue fact checks (name, SKU, price, release date). This is the only route found so far to verified Disney Store data at scale.
3. **For the news sites:**
   - Allow the hosts in the network settings.
   - Let Basil read each site's terms and robots.txt, then record them in `access_policy.json`.
   - Use RSS where available, with low-rate reads of facts only.
4. **DLP:** read the legal notice and terms (Mentions légales and Conditions d'utilisation) and ask about the press site and a feed.
5. **Loungefly / Funko:** ask for a product data feed or written permission.

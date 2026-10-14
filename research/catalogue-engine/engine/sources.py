"""Source policy: which domains are evidence, which are excluded, and how much they weigh."""
import re
from urllib.parse import urlparse

EXCLUDED = ("pinandpop.com", "pinpics.com", "pintradingdb.com")
MARKETPLACE = ("ebay.", "mercari.", "amazon.", "etsy.", "vinted.", "depop.", "poshmark.")
OFFICIAL = ("disneystore.com", "disneystore.co.uk", "disneystore.eu", "disneystore.fr", "disneystore.de",
            "disneystore.asia", "shopdisney.com", "shopdisney.co.uk", "disneyparks.disney.go.com",
            "disneyworld.disney.go.com", "disneyland.disney.go.com", "disneylandparis.com",
            "disneyparksblog.com", "disney.co.uk", "disney.go.com")
NEWS = ("wdwnt.com", "laughingplace.com", "disneyfoodblog.com", "insidethemagic.net", "dlpreport.com",
        "ed92.org", "wdwinfo.com", "allears.net", "blogmickey.com", "disneytouristblog.com",
        "disneyblog.com", "mickeyblog.com", "dapsmagic.com", "wdwmagic.com", "disneydining.com",
        "attractionsmagazine.com", "theffeed.com", "inside-disney.com")
FAN = ("disneypinsblog.com", "extramagicminutes.com", "dismerchandise.com", "disneymouseketeer.com",
       "threads.net", "threads.com", "instagram.com", "reddit.com", "facebook.com", "youtube.com",
       "tiktok.com", "x.com", "twitter.com")

CLASS_WEIGHT = {"official": 3, "news": 2, "fan": 1, "unclassified": 1, "marketplace": 0, "excluded": 0}


def domain_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return re.sub(r"^(www\d?|m)\.", "", host)


# Regional storefronts of one retailer are one publisher: disneystore.co.uk and disneystore.eu
# must not corroborate each other.
PUBLISHER_FAMILIES = (
    (("disneystore.", "shopdisney."), "Disney Store (all regions)"),
    (("twitter.com", "x.com"), "x.com"),
)


def registrable(host: str) -> str:
    """Collapse subdomains (blog.x.com = x.com) and regional storefronts into one publisher."""
    for needles, family in PUBLISHER_FAMILIES:
        if any(host == n or host.startswith(n) or ("." + n) in "." + host for n in needles):
            return family
    return _registrable(host)


def _registrable(host: str) -> str:
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in ("co", "com", "org") and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    # disney.go.com sub-sites are distinct official properties; keep them apart
    if host.endswith(".disney.go.com"):
        return host
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def _match(host: str, needles) -> bool:
    return any(host == n or host.endswith("." + n) or host.startswith(n) for n in needles)


def classify(url: str) -> str:
    host = domain_of(url)
    if not host:
        return "unclassified"
    if _match(host, EXCLUDED):
        return "excluded"
    if any(m in host for m in MARKETPLACE):
        return "marketplace"
    if _match(host, OFFICIAL):
        return "official"
    if _match(host, NEWS):
        return "news"
    if _match(host, FAN):
        return "fan"
    return "unclassified"


def is_evidence(url: str) -> bool:
    return classify(url) not in ("excluded", "marketplace")


MARKETS = (("disneystore.co.uk", "UK"), ("shopdisney.co.uk", "UK"), ("disneystore.eu", "EU"), ("disneystore.fr", "EU"),
           ("disneystore.de", "EU"), ("disneystore.asia", "Asia"), ("disneystore.com.au", "AU"), ("disneylandparis.com", "FR-DLP"),
           ("disneystore.com", "US"), ("shopdisney.com", "US"))


def market_of(url: str) -> str:
    """Retail market of an official store page ('' when unknown, e.g. news/fan sites)."""
    host = domain_of(url)
    for needle, m in MARKETS:
        if host == needle or host.endswith("." + needle):
            return m
    return ""

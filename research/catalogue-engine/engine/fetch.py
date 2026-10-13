"""Polite live fetcher → evidence packet claims (method 'page_fetch').

Only fetches allow-listed official/news hosts, honours robots.txt, identifies
itself, rate-limits per host, and extracts *facts only* from structured
product data (schema.org JSON-LD Product / OpenGraph). It never stores page
text or images. In the current cloud environment outbound access to these
hosts is denied by network policy, so every fetch returns status 'blocked'.
"""
import json
import re
import time
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from urllib.parse import urlparse
from . import sources as S

UA = "PinHuntCatalogueResearch/0.1 (+research prototype; contact: catalogue@pinhunt.invalid)"
MIN_INTERVAL_S = 5.0
_last, _robots = {}, {}


def allowed_host(url: str) -> bool:
    return S.classify(url) in ("official", "news")


def robots_ok(url: str) -> bool:
    p = urlparse(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser(base + "/robots.txt")
        try:
            rp.read()
        except Exception:
            rp = "unreachable"   # robots.txt unreadable → never fetch
        _robots[base] = rp
    rp = _robots[base]
    if rp == "unreachable":
        return None
    return rp.can_fetch(UA, url)


class _Meta(HTMLParser):
    def __init__(self):
        super().__init__()
        self.jsonld, self.og, self._in = [], {}, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in = True
        if tag == "meta" and (a.get("property") or "").startswith(("og:", "product:")):
            self.og[a["property"]] = a.get("content", "")

    def handle_endtag(self, tag):
        if tag == "script":
            self._in = False

    def handle_data(self, data):
        if self._in and data.strip():
            try:
                self.jsonld.append(json.loads(data))
            except ValueError:
                pass


def _products(obj):
    if isinstance(obj, list):
        for o in obj:
            yield from _products(o)
    elif isinstance(obj, dict):
        if obj.get("@type") in ("Product", ["Product"]):
            yield obj
        for v in obj.get("@graph", []) if isinstance(obj.get("@graph"), list) else []:
            yield from _products(v)


def extract_claims(html: str, url: str):
    """Structured facts only. Descriptions are deliberately not captured."""
    m = _Meta()
    m.feed(html)
    claims = []
    add = lambda f, v, note: v not in (None, "") and claims.append(dict(field=f, value=v, source_url=url, method="page_fetch", note=note))
    for p in _products(m.jsonld):
        add("pin_name", p.get("name"), "schema.org Product name")
        add("product_code", p.get("sku") or p.get("mpn") or p.get("productID"), "schema.org Product sku")
        offers = p.get("offers") or {}
        offers = offers[0] if isinstance(offers, list) and offers else offers
        if isinstance(offers, dict):
            add("original_price", offers.get("price"), "schema.org offer price (current, may differ from launch price)")
            add("currency", offers.get("priceCurrency"), "schema.org offer currency")
        le = re.search(r"limited edition (?:size )?(?:of )?([\d,]{3,6})", json.dumps(p), re.I)
        if le:
            add("edition_size", le.group(1), "edition size stated in product data")
    if not claims and m.og.get("og:title"):
        add("pin_name", m.og["og:title"], "OpenGraph title")
        add("original_price", m.og.get("product:price:amount"), "OpenGraph price")
        add("currency", m.og.get("product:price:currency"), "OpenGraph currency")
    return claims


def fetch(url: str, timeout=20):
    """→ (status, claims). status ∈ ok | not_allowlisted | robots_disallow | blocked | http_<code>."""
    if not allowed_host(url):
        return "not_allowlisted", []
    host = urlparse(url).netloc
    wait = MIN_INTERVAL_S - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    try:
        ok = robots_ok(url)
        if ok is None:
            return "blocked (robots.txt unreachable — network policy or host down)", []
        if not ok:
            return "robots_disallow", []
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            _last[host] = time.time()
            return "ok", extract_claims(r.read(2_000_000).decode("utf-8", "replace"), url)
    except urllib.error.HTTPError as e:
        return f"http_{e.code}", []
    except Exception as e:     # proxy 403 on CONNECT surfaces here
        return f"blocked ({type(e).__name__})", []

"""Load and validate evidence packets into flat claim records. Invalid claims are kept, with a reason, in `rejected`."""
import json
import re
import glob
from urllib.parse import urlparse
from . import sources as S
from .normalize import PIN_FIELDS, SET_FIELDS, METHODS, normalise


MAX_VALUE_CHARS = 600          # facts are short; long values suggest pasted descriptions
MAX_CLAIMS_PER_PACKET = 20000
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


class Store:
    def __init__(self):
        self.claims, self.rejected, self.not_found, self.sources, self.packets = [], [], [], {}, []
        self.pins, self.sets = {}, {}          # key -> set_key / parent_set_key

    def add_packet(self, pkt: dict, origin: str = ""):
        pid = pkt.get("packet_id") or origin
        n = sum(len(x.get("claims", [])) for x in pkt.get("pins", []) + pkt.get("sets", []))
        if n > MAX_CLAIMS_PER_PACKET:
            raise ValueError(f"packet {pid} has {n} claims (> {MAX_CLAIMS_PER_PACKET}); split it")
        self.packets.append(dict(packet_id=pid, collector=pkt.get("collector", ""), collected_at=pkt.get("collected_at", ""),
                                 origin=origin, notes=str(pkt.get("discovery_notes", ""))[:2000]))
        for s in pkt.get("sources", []):
            url = s.get("url")
            if url:
                self.sources.setdefault(url, dict(s, packet_id=pid))
        for st in pkt.get("sets", []):
            key = st["set_key"]
            self.sets.setdefault(key, st.get("parent_set_key") or "")
            for c in st.get("claims", []):
                self._claim(pid, "set", key, key, c)
        for p in pkt.get("pins", []):
            key, sk = p["pin_key"], p.get("set_key") or "/".join(p["pin_key"].split("/")[:-1])
            self.pins.setdefault(key, sk)
            self.sets.setdefault(sk, "/".join(sk.split("/")[:-1]) if "/" in sk else "")
            for c in p.get("claims", []):
                self._claim(pid, "pin", key, sk, c)
        for nf in pkt.get("not_found", []):
            self.not_found.append(dict(nf, packet_id=pid))

    def _claim(self, pid, etype, key, set_key, c):
        field, method, url = c.get("field"), c.get("method"), (c.get("source_url") or "").strip()
        rec = dict(claim_id=f"C{len(self.claims) + len(self.rejected) + 1:05d}", packet_id=pid, entity_type=etype,
                   key=key, set_key=set_key, field=field, raw_value=c.get("value"), method=method, url=url,
                   note=CONTROL.sub(" ", str(c.get("note", "")))[:240])
        allowed = PIN_FIELDS if etype == "pin" else SET_FIELDS
        reason = None
        if field not in allowed:
            reason = f"unknown {etype} field '{field}'"
        elif method not in METHODS:
            reason = f"unknown method '{method}'"
        elif method not in ("physical_pin", "editorial") and not url:
            reason = "no source URL"
        if url and reason is None and urlparse(url).scheme not in ("http", "https"):
            reason = "source URL must be http(s)"
        if url and reason is None and len(url) > 2000:
            reason = "source URL too long"
        if reason is None and len(json.dumps(c.get("value"), default=str)) > MAX_VALUE_CHARS:
            reason = f"value longer than {MAX_VALUE_CHARS} chars (looks like copied text, not a fact)"
        if url and reason is None and urlparse(url).path.strip("/") == "":
            reason = "source URL is a bare home page, not a specific page"
        if url and reason is None:
            cls = S.classify(url)
            rec.update(source_class=cls, domain=S.domain_of(url), publisher=S.registrable(S.domain_of(url)))
            if cls == "excluded":
                reason = "excluded source (policy: Pin & Pop / PinPics / PinTradingDB)"
            elif cls == "marketplace":
                reason = "marketplace listing is not evidence"
        else:
            rec.setdefault("source_class", "physical" if method == "physical_pin" else "none")
            rec.setdefault("domain", ""), rec.setdefault("publisher", "physical" if method == "physical_pin" else "")
        if reason is None:
            v = normalise(field, c.get("value"))
            if v is None:
                reason = "no usable value"
            rec["value"] = v
        if reason:
            rec["reason"] = reason
            self.rejected.append(rec)
        else:
            self.claims.append(rec)


def load_packets(patterns) -> Store:
    st = Store()
    for pat in patterns:
        for path in sorted(glob.glob(pat)):
            with open(path) as f:
                pkt = json.load(f)
            if not isinstance(pkt, dict) or not ("pins" in pkt or "sets" in pkt):
                continue          # not an evidence packet (e.g. key lists)
            st.add_packet(pkt, origin=path)
    return st

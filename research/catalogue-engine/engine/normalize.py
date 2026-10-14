"""Field vocabulary and value normalisation. Normalisation never adds information."""
import re

PIN_FIELDS = {
    "pin_name", "characters", "main_character", "franchise", "attraction", "set_position", "edition_type",
    "edition_size", "release_date", "release_year", "release_location", "region", "original_price", "currency",
    "product_code", "pack_product_code", "is_chaser", "visual_description", "visual_form", "visual_colours",
    "visual_features", "front_text", "backstamp_text", "size_mm", "materials", "pin_structure",
}
SET_FIELDS = {
    "set_name", "family", "sub_series", "issuer", "format", "expected_pin_count", "pins_per_box", "has_chaser",
    "release_date", "release_location", "region", "price", "currency", "pack_product_code", "edition_type",
    "edition_size",
}
METHODS = {"page_fetch", "search_snippet", "physical_pin", "editorial", "legacy_record"}
EVIDENCE_METHODS = {"page_fetch", "search_snippet", "physical_pin"}
LIST_FIELDS = {"characters", "region", "visual_colours", "visual_features", "release_location"}
# Free-text fields: every distinct statement is kept; disagreement is not a "conflict".
TEXT_FIELDS = {"visual_description", "materials", "format", "franchise", "attraction"}
NUMBER_FIELDS = {"edition_size", "original_price", "price", "expected_pin_count", "pins_per_box", "release_year", "size_mm"}
BOOL_FIELDS = {"is_chaser", "has_chaser"}

ALIASES = {"meg": "Megara", "megara (meg)": "Megara", "chip n dale": "Chip 'n' Dale", "chip 'n' dale": "Chip 'n' Dale",
           "chip and dale": "Chip 'n' Dale", "cruella de vil": "Cruella de Vil", "mickey": "Mickey Mouse",
           "minnie": "Minnie Mouse", "donald": "Donald Duck", "daisy": "Daisy Duck"}


def _clean(s) -> str:
    return re.sub(r"\s+", " ", str(s)).strip()


def norm_key(v) -> str:
    """Comparison key: case/punctuation-insensitive."""
    return re.sub(r"[^a-z0-9]+", " ", str(v).lower()).strip()


def norm_character(c: str) -> str:
    c = _clean(c)
    return ALIASES.get(c.lower(), c)


def norm_date(v):
    s = _clean(v)
    m = re.search(r"(\d{4})-(\d{2})(?:-(\d{2}))?", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}" + (f"-{m.group(3)}" if m.group(3) else "")
    m = re.fullmatch(r"(\d{4})", s)
    return m.group(1) if m else None


def norm_number(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return int(v) if float(v).is_integer() else float(v)
    m = re.search(r"\d[\d,]*(?:\.\d+)?", str(v))
    if not m:
        return None
    n = float(m.group(0).replace(",", ""))
    return int(n) if n.is_integer() else n


def norm_bool(v):
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("true", "yes", "y", "1"):
        return True
    if s in ("false", "no", "n", "0", "none"):
        return False
    return None


def normalise(field: str, value):
    """Return a normalised value, or None when the claim carries no usable value."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if field in LIST_FIELDS:
        items = value if isinstance(value, list) else re.split(r"\s*[;,]\s*", str(value))
        fn = norm_character if field == "characters" else _clean
        out = sorted({fn(i) for i in items if str(i).strip()}, key=str.lower)
        return out or None
    if field == "main_character":
        return norm_character(value)
    if field == "release_date":
        return norm_date(value)
    if field in NUMBER_FIELDS:
        return norm_number(value)
    if field in BOOL_FIELDS:
        return norm_bool(value)
    if field == "currency":
        s = _clean(value).upper()
        return {"$": "USD", "£": "GBP", "€": "EUR"}.get(s, s[:3]) if s else None
    if field in ("product_code", "pack_product_code"):
        m = re.search(r"\d{9,15}", str(value))
        return m.group(0) if m else _clean(value)
    return _clean(value)


def dates_compatible(a: str, b: str) -> bool:
    """'2026-01' and '2026-01-13' agree; '2026-06-02' and '2026-06-23' do not."""
    return a.startswith(b) or b.startswith(a)

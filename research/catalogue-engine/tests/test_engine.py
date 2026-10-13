"""Run: python3 -m unittest discover -s tests   (from research/catalogue-engine)"""
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine.load import Store                      # noqa: E402
from engine.reconcile import reconcile             # noqa: E402
from engine import sources as S, fetch             # noqa: E402
from engine.run import run                         # noqa: E402


def claim(field, value, url, method="search_snippet"):
    return dict(field=field, value=value, source_url=url, method=method, note="t")


def packet(pins=(), sets=(), nf=()):
    return dict(packet_id="t", sources=[], pins=list(pins), sets=list(sets), not_found=list(nf))


OFF = "https://www.disneystore.com/x"
NEWS = "https://wdwnt.com/x"
FAN = "https://disneypinsblog.com/x"


class SourcePolicy(unittest.TestCase):
    def test_classes(self):
        self.assertEqual(S.classify("https://pinandpop.com/pins/1"), "excluded")
        self.assertEqual(S.classify("https://www.pinpics.com/x"), "excluded")
        self.assertEqual(S.classify("https://www.ebay.co.uk/itm/1"), "marketplace")
        self.assertEqual(S.classify("https://www.disneystore.co.uk/a"), "official")
        self.assertEqual(S.classify(NEWS), "news")

    def test_excluded_and_marketplace_claims_rejected(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="f/s/a", claims=[claim("characters", ["A"], "https://pinandpop.com/p"),
                                                                    claim("edition_size", 100, "https://www.ebay.com/i"),
                                                                    claim("characters", ["A"], FAN)])]))
        self.assertEqual(len(st.claims), 1)
        self.assertEqual({r["reason"][:8] for r in st.rejected}, {"excluded", "marketpl"})

    def test_claim_without_url_rejected(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="f/s/a", claims=[claim("characters", ["A"], "")])]))
        self.assertEqual(st.rejected[0]["reason"], "no source URL")


class Reconciliation(unittest.TestCase):
    def _one(self, claims, field):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="f/s/a", claims=claims)]))
        pins, _ = reconcile(st)
        return pins["f/s/a"], pins["f/s/a"]["fields"].get(field)

    def test_confidence_ladder(self):
        self.assertEqual(self._one([claim("characters", ["A"], FAN)], "characters")[1]["confidence"], "Low")
        self.assertEqual(self._one([claim("characters", ["A"], FAN), claim("characters", ["A"], NEWS)], "characters")[1]["confidence"], "Medium")
        self.assertEqual(self._one([claim("characters", ["A"], OFF)], "characters")[1]["confidence"], "Medium")
        self.assertEqual(self._one([claim("characters", ["A"], OFF), claim("characters", ["A"], NEWS)], "characters")[1]["confidence"], "High")
        self.assertEqual(self._one([claim("characters", ["A"], OFF, "page_fetch")], "characters")[1]["confidence"], "High")

    def test_same_publisher_counts_once(self):
        r = self._one([claim("characters", ["A"], FAN), claim("characters", ["A"], FAN + "/other")], "characters")[1]
        self.assertEqual(r["confidence"], "Low")

    def test_conflict_is_flagged_not_resolved_silently(self):
        p, r = self._one([claim("characters", ["A"], FAN), claim("edition_size", "2,250", FAN), claim("edition_size", 3750, NEWS)], "edition_size")
        self.assertEqual(r["status"], "conflict")
        self.assertIn("2250", r["alternatives"])
        self.assertIn("3750", r["alternatives"])
        self.assertTrue(any("conflict: edition_size" in x for x in p["review_reasons"]))

    def test_compatible_dates_merge_to_most_precise(self):
        r = self._one([claim("release_date", "2026-01", FAN), claim("release_date", "2026-01-13", NEWS)], "release_date")[1]
        self.assertEqual((r["value"], r["status"], r["confidence"]), ("2026-01-13", "ok", "Medium"))

    def test_editorial_never_counts(self):
        p, r = self._one([claim("characters", ["A"], "", "editorial")], "characters")
        self.assertIsNone(r["value"])
        self.assertEqual(p["record_confidence"], "Unverified")

    def test_no_invention(self):
        """Every non-empty output value must equal a claimed value (or be inherited/derived from one)."""
        st = Store()
        st.add_packet(packet(sets=[dict(set_key="f/s", claims=[claim("expected_pin_count", 3, OFF), claim("release_date", "2026-03-03", OFF)])],
                             pins=[dict(pin_key="f/s/a", claims=[claim("characters", ["A"], OFF)])]))
        pins, sets = reconcile(st)
        f = pins["f/s/a"]["fields"]
        claimed = {(c["key"], c["field"]): c["value"] for c in st.claims}
        for fld, r in f.items():
            if r.get("inherited_from"):
                self.assertEqual(r["value"], claimed[(r["inherited_from"], fld)])
            elif r.get("derived_from"):
                self.assertEqual(str(r["value"]), str(f[r["derived_from"]]["value"])[:4])
            else:
                self.assertEqual(r["value"], claimed[("f/s/a", fld)])
        # set expects 3, only 1 found → incomplete, and no placeholder pins are created
        self.assertTrue(sets["f/s"]["completeness"].startswith("incomplete"))
        self.assertEqual(list(pins), ["f/s/a"])


class EndToEnd(unittest.TestCase):
    def test_run_produces_inert_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            pk = pathlib.Path(d, "p.json")
            pk.write_text(json.dumps(packet(
                sets=[dict(set_key="brush-of-magic/mystery-series-1", claims=[claim("set_name", "Brush of Magic Mystery Series 1", OFF), claim("expected_pin_count", 2, OFF)])],
                pins=[dict(pin_key="brush-of-magic/mystery-series-1/pluto", claims=[claim("characters", ["Pluto"], OFF), claim("characters", ["Pluto"], NEWS)]),
                      dict(pin_key="brush-of-magic/mystery-series-1/todd", claims=[claim("characters", ["Todd"], FAN)])])))
            store, pins, sets, dupes, rows = run([str(pk)], d, seed=None)
            self.assertEqual(dupes["brush-of-magic/mystery-series-1/pluto"][0], "DUPLICATE")
            self.assertEqual(dupes["brush-of-magic/mystery-series-1/todd"][0], "PROBABLE DUPLICATE")
            for r in rows:
                self.assertTrue(r["Import action"].startswith("RESEARCH-"))
                self.assertEqual(r["Safe for app search"], "No")
            self.assertTrue(pathlib.Path(d, "catalogue_research_output.xlsx").exists())


class Fetcher(unittest.TestCase):
    def test_extracts_structured_facts_only(self):
        html = """<html><head><meta property="og:title" content="X"><script type="application/ld+json">
        {"@type":"Product","name":"Marie Pin – Brush of Magic – Limited Edition","sku":"438010000000",
         "description":"Long marketing copy that must not be stored","offers":{"price":"24.99","priceCurrency":"USD"}}
        </script></head></html>"""
        cl = fetch.extract_claims(html, OFF)
        fields = {c["field"]: c["value"] for c in cl}
        self.assertEqual(fields["product_code"], "438010000000")
        self.assertEqual(fields["currency"], "USD")
        self.assertNotIn("Long marketing copy", json.dumps(cl))

    def test_policy_blocks_non_allowlisted(self):
        self.assertEqual(fetch.fetch("https://pinandpop.com/x")[0], "not_allowlisted")
        self.assertEqual(fetch.fetch("https://www.ebay.com/x")[0], "not_allowlisted")


if __name__ == "__main__":
    unittest.main()

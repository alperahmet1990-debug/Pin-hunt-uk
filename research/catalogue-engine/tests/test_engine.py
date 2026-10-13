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

    def test_home_page_url_rejected(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="f/s/a", claims=[claim("characters", ["A"], "https://disneypinsblog.com/")])]))
        self.assertIn("home page", st.rejected[0]["reason"])

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

    def test_legacy_only_scalar_is_withheld(self):
        p, r = self._one([claim("characters", ["A"], FAN), claim("edition_size", 2500, FAN, "legacy_record")], "edition_size")
        self.assertIsNone(r["value"])
        self.assertIn("legacy", r["alternatives"])

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


class Hardening(unittest.TestCase):
    def test_formula_injection_neutralised(self):
        from engine.export import safe_cell
        self.assertEqual(safe_cell("=HYPERLINK(\"http://x\")"), "'=HYPERLINK(\"http://x\")")
        self.assertEqual(safe_cell("@SUM(A1)"), "'@SUM(A1)")
        self.assertEqual(safe_cell(-5), -5)
        self.assertEqual(safe_cell("Pluto"), "Pluto")

    def test_bad_urls_and_pasted_text_rejected(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="f/s/a", claims=[
            claim("characters", ["A"], "javascript:alert(1)"),
            claim("visual_description", "x" * 700, FAN)])]))
        reasons = sorted(r["reason"] for r in st.rejected)
        self.assertTrue(any("http(s)" in r for r in reasons))
        self.assertTrue(any("longer than" in r for r in reasons))


class DedupeRegression(unittest.TestCase):
    def test_single_pin_line_never_merges_into_mystery_set(self):
        from engine.dedupe import Catalogue, match_pin
        from engine.run import TRUSTED
        cat = Catalogue(TRUSTED)
        st = match_pin(cat, "Brush of Magic", "Brush of Magic Limited Edition singles", ["Captain Hook"],
                       "Captain Hook Pin - Peter Pan - Brush of Magic", set(), family_hint="brush of magic")
        self.assertNotEqual(st[0], "DUPLICATE")
        st = match_pin(cat, "Brush of Magic", "Brush of Magic Mystery Series 1", ["Peter Pan"], "", set(), family_hint="brush of magic")
        self.assertEqual(st[0], "DUPLICATE")


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

    def test_access_policy_is_default_deny(self):
        self.assertEqual(fetch.fetch("https://www.disneystore.co.uk/x")[0], "not_permitted_by_access_policy")
        self.assertFalse(fetch.permitted_by_policy("https://unknown.example/x"))
        self.assertFalse(fetch.permitted_by_policy("https://www.disneystore.com/x",
                         {"hosts": {"www.disneystore.com": {"fetch_permitted": True, "terms_reviewed": False, "robots_txt_checked": True}}}))
        self.assertTrue(fetch.permitted_by_policy("https://www.disneystore.com/x",
                        {"hosts": {"www.disneystore.com": {"fetch_permitted": True, "terms_reviewed": True, "robots_txt_checked": True}}}))
        policy = fetch.load_policy()
        self.assertTrue(policy["hosts"])
        self.assertFalse(any(h["fetch_permitted"] for h in policy["hosts"].values()))

    def test_https_only_and_no_cross_host_redirects(self):
        import urllib.request
        self.assertEqual(fetch.fetch("http://www.disneystore.com/x")[0], "https_only")
        h = fetch._NoCrossHostRedirect()
        req = urllib.request.Request("https://www.disneystore.com/a")
        with self.assertRaises(urllib.error.HTTPError):
            h.redirect_request(req, None, 302, "Found", {}, "https://evil.example/b")
        with self.assertRaises(urllib.error.HTTPError):
            h.redirect_request(req, None, 302, "Found", {}, "http://www.disneystore.com/b")
        self.assertIsNotNone(h.redirect_request(req, None, 302, "Found", {}, "https://www.disneystore.com/b"))

    def test_policy_blocks_non_allowlisted(self):
        self.assertEqual(fetch.fetch("https://pinandpop.com/x")[0], "not_allowlisted")
        self.assertEqual(fetch.fetch("https://www.ebay.com/x")[0], "not_allowlisted")


if __name__ == "__main__":
    unittest.main()


class SeverityAndRegions(unittest.TestCase):
    def _run(self, claims):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="f/s/a", claims=claims)]))
        return reconcile(st)[0]["f/s/a"]

    def test_regional_codes_are_variants_not_conflicts(self):
        p = self._run([claim("characters", ["A"], OFF), claim("pack_product_code", "438030741301", OFF),
                       claim("pack_product_code", "438030755384", "https://www.disneystore.eu/x")])
        r = p["fields"]["pack_product_code"]
        self.assertEqual(r["status"], "regional variants")
        self.assertIn("US: 438030741301", r["value"])
        self.assertFalse(p["review_reasons"] and any("conflict" in x for x in p["review_reasons"]))

    def test_non_identity_disagreement_is_a_warning(self):
        p = self._run([claim("characters", ["A"], OFF), claim("characters", ["A"], NEWS),
                       claim("release_date", "2026-06-02", NEWS), claim("release_date", "2026-06-23", FAN)])
        self.assertEqual(p["fields"]["release_date"]["status"], "variants")
        self.assertIn("variants: release_date", p["warnings"])
        self.assertNotIn("conflict: release_date", p["review_reasons"])

    def test_identity_conflict_blocks(self):
        p = self._run([claim("characters", ["A"], OFF), claim("edition_size", 2250, NEWS), claim("edition_size", 3750, OFF)])
        self.assertIn("conflict: edition_size", p["review_reasons"])

    def test_identity_pools_publishers_across_identity_fields(self):
        p = self._run([claim("characters", ["Marie"], FAN), claim("pin_name", "Marie Pin – Brush of Magic", OFF)])
        self.assertEqual(p["record_confidence"], "High")

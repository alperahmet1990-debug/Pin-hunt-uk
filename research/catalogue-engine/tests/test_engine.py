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

    def test_uk_record_takes_its_own_market_value_for_import_fields(self):
        UK, AU = "https://www.disneystore.co.uk/x", "https://www.disneystore.com.au/x"
        with tempfile.TemporaryDirectory() as d:
            pk = pathlib.Path(d, "p.json")
            pk.write_text(json.dumps(packet(
                sets=[dict(set_key="dsuk/2026/vday", claims=[claim("set_name", "Valentine's Day Mystery Pin Set", UK),
                                                              claim("set_name", "Valentine's Day 2026 Blind Pack", AU)])],
                pins=[dict(pin_key="dsuk/2026/vday/stitch", claims=[claim("characters", ["Stitch"], UK),
                                                                    claim("currency", "GBP", UK), claim("currency", "AUD", AU)])])))
            _, pins, sets, _, rows = run([str(pk)], d, seed=None)
            self.assertEqual(sets["dsuk/2026/vday"]["fields"]["set_name"]["status"], "regional variants")
            row = rows[0]
            self.assertEqual(row["Collection name"], "Valentine's Day Mystery Pin Set")
            self.assertEqual(row["Currency"], "GBP")
            self.assertEqual(row["Pin name"], "Stitch – Valentine's Day Mystery Pin Set")

    def test_uk_record_with_only_other_markets_values_leaves_the_field_empty(self):
        EU, US = "https://www.disneystore.eu/x", OFF
        with tempfile.TemporaryDirectory() as d:
            pk = pathlib.Path(d, "p.json")
            pk.write_text(json.dumps(packet(pins=[dict(pin_key="dsuk/2025/s3/fozzie", claims=[
                claim("characters", ["Fozzie"], EU), claim("currency", "EUR", EU), claim("currency", "USD", US)])])))
            rows = run([str(pk)], d, seed=None)[4]
            self.assertEqual(rows[0]["Currency"], "")

    def test_uk_record_does_not_take_a_price_seen_only_in_another_market(self):
        with tempfile.TemporaryDirectory() as d:
            pk = pathlib.Path(d, "p.json")
            pk.write_text(json.dumps(packet(pins=[
                dict(pin_key="dsuk/2025/sp/stitch", claims=[claim("characters", ["Stitch"], OFF),
                     claim("original_price", 19.99, OFF), claim("currency", "USD", OFF)]),
                dict(pin_key="wdw/2025/sp/stitch", claims=[claim("characters", ["Stitch"], OFF),
                     claim("original_price", 19.99, OFF), claim("currency", "USD", OFF)])])))
            rows = {r["research_key"]: r for r in run([str(pk)], d, seed=None)[4]}
            self.assertEqual((rows["dsuk/2025/sp/stitch"]["Original price"], rows["dsuk/2025/sp/stitch"]["Currency"]), ("", ""))
            self.assertEqual(rows["wdw/2025/sp/stitch"]["Original price"], 19.99)


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


class CrossSetDuplicates(unittest.TestCase):
    def test_same_subject_in_related_sets_is_flagged_not_merged(self):
        from engine.run import cross_set_suspects
        sets = {
            "dlp/2026/tangled-spin-june": {"parent": "", "fields": {"set_name": {"value": "Tangled Spin pins"}, "release_date": {"value": "2026-06"}}},
            "dlp/2026/raiponce-tangled-spin": {"parent": "", "fields": {"set_name": {"value": "Raiponce Tangled Spin"}, "release_date": {"value": "2026-06-13"}}},
            "dlp/2026/princess-studio-rapunzel": {"parent": "", "fields": {"set_name": {"value": "Princess Studio"}, "release_date": {"value": "2026-02"}}},
        }
        pins = {k + "/rapunzel": {"set_key": k, "fields": {}} for k in sets}
        out = cross_set_suspects(pins, sets)
        self.assertEqual(out, {"dlp/2026/tangled-spin-june/rapunzel": "dlp/2026/raiponce-tangled-spin/rapunzel"})

    def test_person_recorded_distinct_finding_clears_only_that_pair(self):
        def go(nf):
            with tempfile.TemporaryDirectory() as d:
                pk = pathlib.Path(d, "p.json")
                pk.write_text(json.dumps(packet(
                    sets=[dict(set_key=k, claims=[claim("set_name", n, OFF), claim("release_date", "2025-05-22", OFF)])
                          for k, n in (("dsuk/2025/a", "Stitch Mystery Set"), ("dsuk/2025/b", "Pin Trading Mystery Set"))],
                    pins=[dict(pin_key=f"dsuk/2025/{x}/stitch", claims=[claim("characters", ["Stitch"], OFF)]) for x in "ab"],
                    nf=nf)))
                return run([str(pk)], d, seed=None)[1]
        flagged = [r for p in go([]).values() for r in p["review_reasons"] if "cross-set duplicate" in r]
        self.assertEqual(len(flagged), 1)
        pins = go([dict(key="dsuk/2025/b/stitch", field="identity", note="distinct: not the same pin as dsuk/2025/a/stitch")])
        self.assertFalse(any("cross-set duplicate" in r for p in pins.values() for r in p["review_reasons"]))
        pins = go([dict(key="dsuk/2025/b/stitch", field="identity", note="distinct: not the same pin as dsuk/2025/zzz/stitch")])
        self.assertTrue(any("cross-set duplicate" in r for p in pins.values() for r in p["review_reasons"]))

    def test_same_character_in_unrelated_sets_is_not_flagged(self):
        from engine.run import cross_set_suspects
        sets = {
            "dlp/2025/halloween-2025-oe": {"parent": "", "fields": {"set_name": {"value": "Halloween open edition"}, "release_date": {"value": "2025-09-20"}}},
            "dlp/2025/mickey-friends-skiing": {"parent": "", "fields": {"set_name": {"value": "Mickey and Friends skiing"}, "release_date": {"value": "2025-01"}}},
        }
        pins = {k + "/goofy": {"set_key": k, "fields": {}} for k in sets}
        self.assertEqual(cross_set_suspects(pins, sets), {})

    def test_different_parks_are_not_compared(self):
        from engine.run import cross_set_suspects
        sets = {
            "dlp/2026/dumbo-85th": {"parent": "", "fields": {"set_name": {"value": "Dumbo 85th"}, "release_date": {"value": "2026-10"}}},
            "dlr/2026/dumbo-85th": {"parent": "", "fields": {"set_name": {"value": "Dumbo 85th"}, "release_date": {"value": "2026-10"}}},
        }
        pins = {k + "/dumbo": {"set_key": k, "fields": {}} for k in sets}
        self.assertEqual(cross_set_suspects(pins, sets), {})


class PublisherFamilies(unittest.TestCase):
    def test_regional_disney_stores_are_one_publisher(self):
        self.assertEqual(S.registrable("disneystore.co.uk"), S.registrable("disneystore.eu"))
        self.assertEqual(S.registrable("shopdisney.com"), S.registrable("disneystore.com.au"))
        self.assertEqual(S.registrable("twitter.com"), S.registrable("x.com"))
        self.assertNotEqual(S.registrable("disneystore.co.uk"), S.registrable("mydisneystore.blog.com"))

    def test_two_regional_stores_do_not_corroborate(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[
            claim("characters", ["Goofy"], "https://www.disneystore.co.uk/a-438000000001.html"),
            claim("characters", ["Goofy"], "https://www.disneystore.eu/a-438000000001.html")])]))
        pins, _ = reconcile(st)
        self.assertEqual(pins["s/x/p"]["fields"]["characters"]["publishers"], ["Disney Store (all regions)"])


class SecondarySources(unittest.TestCase):
    def test_fan_database_is_fan_and_never_an_independent_publisher(self):
        self.assertEqual(S.classify("https://disneypinventory.com/pin/x"), "fan")
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[
            claim("characters", ["Goofy"], FAN),
            claim("characters", ["Goofy"], "https://disneypinventory.com/pin/x")])]))
        pins, _ = reconcile(st)
        self.assertEqual(pins["s/x/p"]["fields"]["characters"]["confidence"], "Low")

    def test_fan_database_alone_is_low(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[
            claim("characters", ["Goofy"], "https://disneypinventory.com/pin/x")])]))
        pins, _ = reconcile(st)
        self.assertEqual(pins["s/x/p"]["fields"]["characters"]["confidence"], "Low")

    def test_repeated_release_info_counts_under_its_upstream(self):
        st = Store()
        c2 = claim("characters", ["Goofy"], "https://grownupmagic.com/post")
        c2["derived_from"] = "https://wdwnt.com/x"
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[claim("characters", ["Goofy"], NEWS), c2])]))
        pins, _ = reconcile(st)
        f = pins["s/x/p"]["fields"]["characters"]
        self.assertEqual(f["confidence"], "Low")
        self.assertEqual(f["publishers"], ["wdwnt.com"])

    def test_two_independent_secondary_sites_are_medium_not_high(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[
            claim("characters", ["Goofy"], NEWS), claim("characters", ["Goofy"], "https://www.mousesteps.com/x")])]))
        pins, _ = reconcile(st)
        self.assertEqual(pins["s/x/p"]["fields"]["characters"]["confidence"], "Medium")
        self.assertEqual(S.classify("https://www.mousesteps.com/x"), "fan")

    def test_identifiers_never_taken_from_fan_database(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[
            claim("product_code", "2078210260048", "https://disneypinventory.com/pin/x")])]))
        self.assertEqual(len(st.claims), 0)
        self.assertIn("fan pin databases", st.rejected[0]["reason"])


class Dashboard(unittest.TestCase):
    def _cands(self):
        ev = lambda method, url, cls="news": dict(field="characters", value=["A"], source_url=url, publisher="", source_class=cls, method=method, note=None, claim_ref=None)
        pin = lambda key, sk, evidence: dict(research_key=key, entity_type="pin", set_research_key=sk, proposed={}, record_confidence="Medium",
                                             engine_verified=True, review_reasons=[], warnings=[], duplicate_status="NEW", duplicate_pinhunt_id=None, evidence=evidence)
        return [
            dict(research_key="dsuk/2025/a", entity_type="set", set_research_key=None, proposed={"release_date": "2025-03-01", "expected_pin_count": 3},
                 record_confidence="Medium", engine_verified=False, review_reasons=[], warnings=[], duplicate_status="NEW", duplicate_pinhunt_id=None, evidence=[]),
            pin("dsuk/2025/a/x", "dsuk/2025/a", [ev("search_snippet", "https://wdwnt.com/x"), ev("search_snippet", "https://disneypinventory.com/x", "fan")]),
            pin("dsuk/2025/a/y", "dsuk/2025/a", [ev("human_direct_check", "https://www.disneystore.co.uk/y", "official")]),
        ]

    def test_snippets_never_count_as_direct_and_fan_databases_not_independent(self):
        from tools.dashboard import build
        m, _ = build({"candidates": self._cands()}, {})
        self.assertEqual(m["direct"], 1)
        self.assertEqual(m["2pub"], 0)

    def test_coverage_counts_missing_pins_and_empty_months(self):
        from tools.dashboard import coverage
        rows, gaps = coverage(self._cands(), as_of="2025-04")
        r = rows[("dsuk", "2025-03")]
        self.assertEqual((r["sets"], r["pins"], r["counted"], r["complete"], r["missing_pins"]), (1, 2, 1, 0, 1))
        self.assertIn("2025-04", gaps["dsuk"])
        self.assertNotIn("2025-03", gaps["dsuk"])


class StructureFlag(unittest.TestCase):
    def test_multi_character_pins_ask_for_a_structure_check(self):
        import tempfile, json as _j, pathlib as _p
        from engine.run import run
        with tempfile.TemporaryDirectory() as d:
            pk = _p.Path(d) / "p.json"
            pk.write_text(_j.dumps(packet(pins=[
                dict(pin_key="s/x/duo", set_key="s/x", claims=[claim("characters", ["Mickey", "Minnie"], NEWS)]),
                dict(pin_key="s/x/solo", set_key="s/x", claims=[claim("characters", ["Goofy"], NEWS)])])))
            _, pins, _, _, _ = run([str(pk)], str(_p.Path(d) / "out"), seed=None)
        self.assertTrue(any(r.startswith("structure:") for r in pins["s/x/duo"]["review_reasons"]))
        self.assertFalse(any(r.startswith("structure:") for r in pins["s/x/solo"]["review_reasons"]))

    def test_fan_wikis_are_fan_databases(self):
        self.assertTrue(S.is_fan_database("https://muppet.fandom.com/wiki/x"))
        self.assertEqual(S.classify("https://muppet.fandom.com/wiki/x"), "fan")


class GroupingAndVariants(unittest.TestCase):
    def _run(self, pins, sets=()):
        import tempfile, json as _j, pathlib as _p
        from engine.run import run
        with tempfile.TemporaryDirectory() as d:
            pk = _p.Path(d) / "p.json"
            pk.write_text(_j.dumps(packet(pins=pins, sets=list(sets))))
            _, out, _, _, _ = run([str(pk)], str(_p.Path(d) / "out"), seed=None)
        return out

    def test_source_saying_separate_pins_blocks_a_combined_record(self):
        out = self._run([dict(pin_key="s/x/duo", set_key="s/x", claims=[
            claim("characters", ["Rapunzel", "Flynn"], NEWS), claim("pin_structure", "separate pins", FAN)])])
        self.assertTrue(any(r.startswith("conflict:") for r in out["s/x/duo"]["review_reasons"]))

    def test_source_confirming_one_pin_clears_the_structure_prompt(self):
        out = self._run([dict(pin_key="s/x/duo", set_key="s/x", claims=[
            claim("characters", ["Mickey", "Minnie"], NEWS), claim("pin_structure", "one pin", NEWS)])])
        self.assertFalse(any(r.startswith(("structure:", "conflict:")) for r in out["s/x/duo"]["review_reasons"]))

    def test_variant_is_not_called_a_duplicate(self):
        out = self._run([
            dict(pin_key="s/x/stitch", set_key="s/x", claims=[claim("characters", ["Stitch"], NEWS), claim("is_chaser", False, NEWS)]),
            dict(pin_key="s/x/stitch-chaser", set_key="s/x", claims=[claim("characters", ["Stitch"], NEWS), claim("is_chaser", True, NEWS)])])
        reasons = out["s/x/stitch-chaser"]["review_reasons"]
        self.assertTrue(any(r.startswith("variant:") for r in reasons))
        self.assertFalse(any("duplicate" in r for r in reasons))

    def test_more_pins_than_stated_count_is_flagged(self):
        out = self._run([dict(pin_key=f"s/x/p{i}", set_key="s/x", claims=[claim("characters", [f"C{i}"], NEWS)]) for i in range(3)],
                        sets=[dict(set_key="s/x", claims=[claim("expected_pin_count", 2, NEWS)])])
        self.assertTrue(any(r.startswith("grouping:") for r in out["s/x/p0"]["review_reasons"]))

    def test_grouping_finding_blocks_split_records(self):
        import tempfile, json as _j, pathlib as _p
        from engine.run import run
        pk = packet(pins=[dict(pin_key="s/x/mickey", set_key="s/x", claims=[claim("characters", ["Mickey"], NEWS)])],
                    nf=[dict(key="s/x/mickey", field="pin_structure", note="grouping: source shows a combined pin s/x/mickey-and-minnie")])
        with tempfile.TemporaryDirectory() as d:
            f = _p.Path(d) / "p.json"
            f.write_text(_j.dumps(pk))
            _, out, _, _, _ = run([str(f)], str(_p.Path(d) / "out"), seed=None)
        self.assertTrue(any(r.startswith("conflict: grouping:") for r in out["s/x/mickey"]["review_reasons"]))


class EditionTypeSpelling(unittest.TestCase):
    def test_spelling_variants_are_not_conflicts(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[
            claim("characters", ["Lotso"], NEWS), claim("edition_type", "open", NEWS), claim("edition_type", "Open Edition", FAN)])]))
        pins, _ = reconcile(st)
        f = pins["s/x/p"]["fields"]["edition_type"]
        self.assertEqual(f["value"], "open edition")
        self.assertNotIn("conflict", str(f["status"]))

    def test_real_edition_disagreement_still_blocks(self):
        st = Store()
        st.add_packet(packet(pins=[dict(pin_key="s/x/p", set_key="s/x", claims=[
            claim("characters", ["Eric"], NEWS), claim("edition_type", "LE 1000", NEWS), claim("edition_type", "open edition", FAN)])]))
        pins, _ = reconcile(st)
        self.assertTrue(any(r.startswith("conflict:") for r in pins["s/x/p"]["review_reasons"]))

    def test_review_hold_blocks_sign_off(self):
        import tempfile, json as _j, pathlib as _p
        from engine.run import run
        pk = packet(pins=[dict(pin_key="s/x/chef-remy", set_key="s/x", claims=[claim("characters", ["Remy"], NEWS)])],
                    nf=[dict(key="s/x/chef-remy", field="identity", note="hold: possible duplicate of s/x/remy; review before approval")])
        with tempfile.TemporaryDirectory() as d:
            f = _p.Path(d) / "p.json"
            f.write_text(_j.dumps(pk))
            _, out, _, _, _ = run([str(f)], str(_p.Path(d) / "out"), seed=None)
        self.assertTrue(any(r.startswith("conflict: hold:") for r in out["s/x/chef-remy"]["review_reasons"]))


class DuplicateCharacterSuggestion(unittest.TestCase):
    def test_contained_name_is_suggested_not_applied(self):
        from engine.run import duplicate_character_suggestion as s
        self.assertEqual(s(["627", "Experiment 627", "Stitch"]),
                         "suggest: Characters → Experiment 627; Stitch (listed twice: 627)")
        self.assertIsNone(s(["Mickey", "Minnie"]))
        self.assertIsNone(s(["Stitch"]))
        self.assertIsNone(s([]))


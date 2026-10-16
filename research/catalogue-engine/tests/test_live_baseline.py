"""The duplicate check must pause (never skip) when the live baseline is missing or stale."""
import json, os, shutil, subprocess, sys, tempfile, unittest, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, '..', 'tools')
PAYLOAD = {'format': 'x', 'candidates': [{'research_key': 'wdw/2019/oe/stitch', 'entity_type': 'pin', 'set_research_key': 'wdw/2019/oe-single/stitch',
           'proposed': {'Pin name': 'Stitch 2019', 'Characters': 'Stitch', 'Release year': 2019}, 'record_confidence': 'Low',
           'review_reasons': [], 'warnings': [], 'duplicate_status': 'NEW', 'evidence': [{'source_url': 'https://wdwnt.com/x', 'source_class': 'news'}]}]}

def run(baseline):
    d = tempfile.mkdtemp()
    shutil.copytree(TOOLS, os.path.join(d, 'tools'))
    if baseline is not None:
        os.makedirs(os.path.join(d, 'baseline'))
        json.dump(baseline, open(os.path.join(d, 'baseline', 'live_catalogue_fingerprint.json'), 'w'))
    json.dump(PAYLOAD, open(os.path.join(d, 'p.json'), 'w'))
    env = {k: v for k, v in os.environ.items() if k != 'LIVE_PINS'}
    return subprocess.run([sys.executable, os.path.join(d, 'tools', 'backfill_report.py'), os.path.join(d, 'p.json'), os.path.join(d, 'o.xlsx')],
                          capture_output=True, text=True, env=env)

def baseline(days_old):
    date = (datetime.date.today() - datetime.timedelta(days=days_old)).isoformat()
    return {'version': date, 'exported_at': date, 'max_age_days': 14, 'rows_total': 1, 'rows_indexed': 0, 'pins': []}

class LiveBaseline(unittest.TestCase):
    def test_missing_baseline_pauses(self):
        r = run(None); self.assertEqual(r.returncode, 3); self.assertIn('DUPLICATE CHECK PAUSED', r.stdout)
    def test_stale_baseline_pauses(self):
        r = run(baseline(30)); self.assertEqual(r.returncode, 3); self.assertIn('days old', r.stdout)
    def test_fresh_baseline_runs(self):
        r = run(baseline(1)); self.assertEqual(r.returncode, 0, r.stdout + r.stderr); self.assertIn('"new": 1', r.stdout)
    def test_committed_baseline_has_no_readable_text(self):
        b = json.load(open(os.path.join(HERE, '..', 'baseline', 'live_catalogue_fingerprint.json')))
        sample = b['pins'][:200]
        for p in sample:
            for k in ('ch', 'chw', 't', 'c'):
                self.assertTrue(all(len(x) == 12 and all(ch in '0123456789abcdef' for ch in x) for x in p[k]))
        self.assertEqual(set().union(*[set(p) for p in sample]) - {'id', 'y', 'k', 'ch', 'chw', 't', 'c', 'line', 'ed'}, set())

"""Filter a full engine payload down to the open-edition pass (wdw|dlr/<year>/oe...) for a separate staging run."""
import json, re, sys, collections
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
oe = re.compile(r'^(wdw|dlr)/\d{4}/oe(-set|-single)?/')
keep = [c for c in d['candidates'] if oe.match(c['research_key'])]
d['candidates'] = keep
json.dump(d, open(dst, 'w'), ensure_ascii=False, indent=1)
pins = [c for c in keep if c['entity_type'] == 'pin']
print('pins', len(pins), 'sets', len(keep) - len(pins))
print('by line/year', collections.Counter('/'.join(c['research_key'].split('/')[:2]) for c in pins))
print('confidence', collections.Counter(c['record_confidence'] for c in pins))
print('dup', collections.Counter(c['duplicate_status'] for c in pins))
print('flags', collections.Counter(r.split(':')[0] for c in pins for r in c['review_reasons']).most_common(8))

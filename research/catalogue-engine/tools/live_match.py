import json,re,collections,sys
STOP=set('the and pin pins disney parks park store mystery series collection limited edition release set box blind pack open of a with in on at for to le lr oe mini booster starter walt world disneyland resort wdw dlr 2020 2021 2022 2023 2024 2025 2026 pc piece'.split())
def toks(s): return {w for w in re.findall(r"[a-z0-9]+",str(s or '').lower()) if w not in STOP and len(w)>1}
def chars(s): return {c.strip().lower() for c in re.split(r"[;,/&]| and ",str(s or '')) if c.strip() and c.strip().lower() not in('unknown','various','null')}
live=json.load(open('live_pins.json'))
idx=collections.defaultdict(list)
for p in live:
    if p['e']=='Seed': continue
    kind='public' if p['v'] else 'archived'
    p['_t']=toks(p['t']); p['_c']=toks(p['c']); p['_ch']=chars(p['a'])|chars(p['m']); p['_k']=kind
    idx[p['y']].append(p)
def match(c):
    pr=c['proposed']; y=pr.get('Release year') or (str(pr.get('Release date') or '')[:4])
    try: y=int(y)
    except: return None
    ch=chars(pr.get('Characters'))|chars(pr.get('Main character')); chtok=toks(' '.join(ch))
    ct=(toks(pr.get('Pin name'))-chtok); cc=toks(pr.get('Collection name'))-chtok
    best=None
    for p in idx.get(y,[]):
        ptok=toks(' '.join(p['_ch']))
        if not (ch & p['_ch'] or chtok & ptok): continue
        pt=p['_t']-ptok; pc=p['_c']-ptok
        tj=len(ct&pt)/max(1,len(ct|pt)) if ct and pt else 0
        cj=len(cc&pc)/max(1,min(len(cc),len(pc))) if cc and pc else 0
        # collection words or distinctive title words must agree, not just the character
        if (cj>=0.6 and len(cc&pc)>=2) or (tj>=0.5 and len(ct&pt)>=1) or (cj>=0.6 and tj>=0.34):
            score=tj+cj
            if best is None or score>best[0]: best=(score,p['id'],p['_k'],p['t'],p['c'])
    return best
if __name__=='__main__':
    d=json.load(open(sys.argv[1])); out=collections.Counter(); ex=collections.defaultdict(list)
    for c in d['candidates']:
        if c['entity_type']!='pin': continue
        m=match(c); k=m[2] if m else 'new'; out[k]+=1
        if m and len(ex[k])<8: ex[k].append((c['research_key'],c['proposed'].get('Pin name'),'=>',m[1],m[3],'|',m[4]))
    print(dict(out))
    for k,v in ex.items():
        print('--',k)
        for e in v: print('  ',e)

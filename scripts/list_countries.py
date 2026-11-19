"""Write dist/data/countries.json: the country packs present in dist/data, for the country selector.

    python scripts/list_countries.py
"""
import json

from common import CONFIG, ROOT

DATA = ROOT/'dist/data'
packs = []
for iso in CONFIG:  # order of countries.json
    manifest = DATA/iso/'manifest.json'
    if manifest.exists():
        m = json.loads(manifest.read_text(encoding='utf8'))
        packs.append(dict(id=iso, name=CONFIG[iso]['name'], updated=m.get('updated')))
(DATA/'countries.json').write_text(json.dumps(packs, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print('Paketat: '+', '.join(f"{p['name']} ({p['id']})" for p in packs))

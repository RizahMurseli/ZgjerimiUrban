"""Bundle the app into self-contained HTML files, one per country pack.

Run from the repository root:
    python scripts/build_single_html.py            every pack in dist/data/countries.json
    python scripts/build_single_html.py XKX ALB    only these

Writes dist/kosova-urban.html for Kosovo and dist/atlas-<iso3>.html for other
countries, with the stylesheet, script and every data file of that country inlined
(data files as base64), so each opens directly from disk without a server.
"""
import base64
import json
import sys
from pathlib import Path

DIST = Path('dist')
packs = json.loads((DIST/'data/countries.json').read_text(encoding='utf8'))
wanted = sys.argv[1:] or [p['id'] for p in packs]


def out_name(iso):
    return 'kosova-urban.html' if iso == 'XKX' else f'atlas-{iso.lower()}.html'


def bundle(iso):
    pack = [p for p in packs if p['id'] == iso]
    files = {'data/countries.json': base64.b64encode(json.dumps(pack, ensure_ascii=False).encode('utf8')).decode('ascii')}
    for path in sorted((DIST/'data'/iso).rglob('*')):
        if path.suffix in ('.png', '.json'):
            files[path.relative_to(DIST).as_posix()] = base64.b64encode(path.read_bytes()).decode('ascii')
    return files


LOADER = """<script>
// Embedded data: fetch('data/…') is answered from this bundle instead of the network.
window.__EMBED__ = __FILES__;
(() => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => {
    const data = window.__EMBED__[String(url)];
    if (data === undefined) return realFetch(url, options);
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const type = String(url).endsWith('.png') ? 'image/png' : 'application/json';
    return Promise.resolve(new Response(new Blob([bytes], {type}), {status: 200}));
  };
})();
</script>"""

html0 = (DIST/'index.html').read_text(encoding='utf8')
css = (DIST/'style.css').read_text(encoding='utf8')
js = (DIST/'app.js').read_text(encoding='utf8').replace('</script', '<\\/script')
for iso in wanted:
    files = bundle(iso)
    loader = LOADER.replace('__FILES__', json.dumps(files, separators=(',', ':')))
    html = html0.replace('<link rel="stylesheet" href="style.css">', '<style>\n'+css+'\n</style>')
    html = html.replace('<script type="module" src="app.js"></script>', loader+'\n<script type="module">\n'+js+'\n</script>')
    assert '<style>' in html and '__EMBED__' in html
    out = DIST/out_name(iso)
    out.write_text(html, encoding='utf8')
    print(f'{out} · {out.stat().st_size/1e6:.1f} MB · {len(files)} skedarë të dhënash brenda')

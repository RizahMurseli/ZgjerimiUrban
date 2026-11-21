"""Stamp style.css and app.js in dist/index.html with a content hash, so browsers load new versions at once."""
import hashlib, re, pathlib, sys
dist = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'dist')
idx = dist/'index.html'
html = idx.read_text(encoding='utf8')
for name in ('style.css', 'app.js'):
    h = hashlib.sha1((dist/name).read_bytes()).hexdigest()[:10]
    html = re.sub(re.escape(name)+r'(\?v=[0-9a-f]*)?"', f'{name}?v={h}"', html)
idx.write_text(html, encoding='utf8')
print('stamped', idx)

"""Built-up area on agricultural land by suitability class (I–VIII), for countries that have such a raster.

Run from the repository root after compute_stats.py:
    python scripts/prepare_soil.py --country XKX

Input: countries.json → "soil": a single-band GeoTIFF of classes 1–8 (1 = most suitable)
in a projected Transverse Mercator system listed in common.TM_SYSTEMS (e.g. EPSG:9141).
Values outside the country boundary are ignored (the boundary masks them).

The class raster is sampled (nearest cell) at the centre of every pixel of both WSF
products, so the result follows each product's own time steps:
  area        ha of each class in the unit
  evolution   ha of each class built in every WSF Evolution step (first step = stock in 1985)
  tracker     ha of each class built in every WSF Tracker step (first step = stock in July 2016)
for the country and every unit of both levels. Writes dist/data/<ISO3>/soil.json.
"""
import json

import numpy as np
import tifffile
from PIL import Image

from common import TM_SYSTEMS, args, bbox_of, burn, paths, polygons, tm_forward

LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
# One hue, dark (most suitable) to light (least suitable).
COLORS = ['#0f6b2f', '#2e8540', '#4f9c4f', '#73b263', '#9cc67f', '#c2d9a3', '#dde8cb', '#eef2e6']
NC = len(LABELS)

OPTS, COUNTRY = args('Ndërtimet sipas klasave të përshtatshmërisë së tokës bujqësore')
if not COUNTRY.get('soil'):
    print(f'{OPTS.country}: pa raster të përshtatshmërisë së tokës ("soil" te countries.json), kapërcehet.')
    raise SystemExit(0)
DATA, CACHE = paths(OPTS.country)
SOIL = COUNTRY['soil']
manifest = json.loads((DATA/'manifest.json').read_text(encoding='utf8'))
boundary = json.loads((DATA/'boundary.json').read_text(encoding='utf8'))
units_full = json.loads((CACHE/'units-full.json').read_text(encoding='utf8'))
units_web = json.loads((DATA/'units.json').read_text(encoding='utf8'))


def load_raster():
    with tifffile.TiffFile(SOIL['path']) as tif:
        page = tif.pages[0]
        dx, dy, _ = page.tags[33550].value
        _, _, _, x0, y0, _ = page.tags[33922].value
        return page.asarray(), x0, y0, dx, dy


def main():
    classes, x0, y0, dx, dy = load_raster()
    tm = TM_SYSTEMS[SOIL['epsg']]
    H, W = classes.shape
    border = [p for f in boundary['features'] for p in polygons(f['geometry'])]
    levels = {'national': [(1, border, 1, bbox_of(border))]}
    for k in ('municipalities', 'cadastral'):
        levels[k] = [(i+1, u['polygons'], u['areaKm2'], bbox_of(u['polygons'])) for i, u in enumerate(units_full[k])]
    size = {k: len(v)+1 for k, v in levels.items()}
    products = {p: (manifest['periods'][p], manifest[p+'Size']) for p in ('evolution', 'tracker')}
    acc = {p: {k: np.zeros((m, len(per['steps'])+1, NC+1)) for k, m in size.items()} for p, (per, _) in products.items()}
    area = {k: np.zeros((m, NC+1)) for k, m in size.items()}

    for tile in manifest['tiles']:
        west, south, east, north = bbox = tile['bbox']
        for product, (per, n) in products.items():
            lut = np.array(per['lut'], dtype=np.uint8)
            S = len(per['steps'])
            codes = lut[np.array(Image.open(DATA/f"{product}-{tile['id']}.png"))].astype(np.int64).ravel()
            dlon, dlat = (east-west)/n, (north-south)/n
            lats = north-(np.arange(n)+.5)*dlat
            lons = west+(np.arange(n)+.5)*dlon
            lon2, lat2 = np.meshgrid(lons, lats)
            E, N = tm_forward(lat2, lon2, **tm)
            cols = np.floor((E-x0)/dx).astype(np.int64).ravel()
            rows = np.floor((y0-N)/dy).astype(np.int64).ravel()
            ok = (cols >= 0) & (cols < W) & (rows >= 0) & (rows < H)
            cls = np.zeros(n*n, dtype=np.int64)
            cls[ok] = classes[rows[ok], cols[ok]]
            cls[(cls < 1) | (cls > NC)] = 0           # 0 = no class
            w = np.broadcast_to(((dlon*111.32*np.cos(np.radians(lats)))*(dlat*111.132))[:, None], (n, n)).ravel()
            for k, shapes in levels.items():
                if not shapes:
                    continue
                lab = burn(n, bbox, shapes, 'L' if k == 'national' else 'I').astype(np.int64).ravel()
                m = size[k]
                acc[product][k] += np.bincount((lab*(S+1)+codes)*(NC+1)+cls, weights=w, minlength=m*(S+1)*(NC+1)).reshape(m, S+1, NC+1)
                if product == 'tracker':  # the finer grid gives the class areas
                    area[k] += np.bincount(lab*(NC+1)+cls, weights=w, minlength=m*(NC+1)).reshape(m, NC+1)
            print(f'toka {tile["id"]} · {product}', flush=True)

    def pack(k, i, digits):
        r = lambda v: round(float(v)*100, digits) if digits else int(round(float(v)*100))
        out = dict(area=[r(v) for v in area[k][i, 1:]])
        for product, (per, _) in products.items():
            # code c ↔ step c−1; classes 1..NC (0 = no class is dropped)
            out[product] = [[r(v) for v in acc[product][k][i, c, 1:]] for c in range(1, len(per['steps'])+1)]
        return out
    out = dict(source=SOIL.get('source', ''), labels=LABELS, colors=COLORS, best=4,
               national=pack('national', 1, 1),
               municipalities={u['id']: pack('municipalities', i+1, 1) for i, u in enumerate(units_web['municipalities'])},
               cadastral={u['id']: pack('cadastral', i+1, 0) for i, u in enumerate(units_web['cadastral'])})
    path = DATA/'soil.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    nat = out['national']
    total_area = sum(nat['area'])
    best = sum(nat['area'][:4])
    ev = np.array(nat['evolution']); tr = np.array(nat['tracker'])
    print(f'soil.json {path.stat().st_size/1e6:.2f} MB · territori {total_area:.0f} ha, klasat I–IV {best:.0f} ha ({best/total_area*100:.1f} %)')
    print(f'Ndërtuar deri 1985 në I–IV: {ev[0, :4].sum():.0f} ha · shtuar 1986–2015: {ev[1:, :4].sum():.0f} ha (gjithsej {ev[1:].sum():.0f} ha)')
    print(f'Tracker: deri korrik 2016 në I–IV: {tr[0, :4].sum():.0f} ha · shtuar pas: {tr[1:, :4].sum():.0f} ha (gjithsej {tr[1:].sum():.0f} ha)')


if __name__ == '__main__':
    main()

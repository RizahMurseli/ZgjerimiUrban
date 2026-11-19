"""Compute summary statistics from the prepared tiles of one country.

Run from the repository root after prepare_data.py and prepare_boundaries.py:
    python scripts/compute_stats.py --country XKX

Writes, in dist/data/<ISO3>/,
  stats.json   national totals, level-1 centres (fixed 5 km radius)
               and every catalogue settlement (1 km radius)
  units.json   adds per-step built-up area to every unit of both levels,
               and the level-1 unit each level-2 unit lies in

Tiles are processed one at a time, so memory stays flat for large countries.
Time steps come from manifest.json (code → step table), so new WSF Tracker
releases need no change here. Areas use the true size of each pixel row.
"""
import json
import math

import numpy as np
from PIL import Image, ImageDraw

from common import args, paths, polygons

MUNICIPAL_RADIUS_KM = 5.0
PLACE_RADIUS_KM = 1.0

OPTS, COUNTRY = args('Llogarit statistikat për një shtet')
DATA, CACHE = paths(OPTS.country)
manifest = json.loads((DATA/'manifest.json').read_text(encoding='utf8'))
boundary = json.loads((DATA/'boundary.json').read_text(encoding='utf8'))
places = json.loads((DATA/'places.json').read_text(encoding='utf8'))
units_web = json.loads((DATA/'units.json').read_text(encoding='utf8'))
units_full = json.loads((CACHE/'units-full.json').read_text(encoding='utf8'))
PERIODS = manifest['periods']
BORDER = [poly for f in boundary['features'] for poly in polygons(f['geometry'])]


def bbox_of(polys):
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    return min(xs), min(ys), max(xs), max(ys)


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def rasterize(n, bbox, shapes):
    """Burn polygons (lon/lat rings) into an n×n int32 label image of one tile; largest first so enclaves survive."""
    west, south, east, north = bbox
    image = Image.new('I', (n, n), 0)
    draw = ImageDraw.Draw(image)
    px = lambda ring: [((lon-west)/(east-west)*n, (north-lat)/(north-south)*n) for lon, lat in ring]
    for label, polys, _, box in sorted(shapes, key=lambda s: -s[2]):
        if not overlaps(box, bbox):
            continue
        for poly in polys:
            draw.polygon(px(poly[0]), fill=label)
            for hole in poly[1:]:
                draw.polygon(px(hole), fill=0)
    return np.array(image)


def country_mask(n, bbox):
    west, south, east, north = bbox
    image = Image.new('L', (n, n), 0)
    draw = ImageDraw.Draw(image)
    for polygon in BORDER:
        for k, ring in enumerate(polygon):
            xy = [((lon-west)/(east-west)*n, (north-lat)/(north-south)*n) for lon, lat in ring]
            draw.polygon(xy, fill=255 if k == 0 else 0)
    return np.array(image) > 127


def shapes_of(layer):
    return [(i+1, u['polygons'], u['areaKm2'], bbox_of(u['polygons'])) for i, u in enumerate(units_full[layer])]


MUN_SHAPES, CAD_SHAPES = shapes_of('municipalities'), shapes_of('cadastral')
NM, NC = len(MUN_SHAPES), len(CAD_SHAPES)


def analyse(product, size):
    steps = len(PERIODS[product]['steps'])
    lut = np.array(PERIODS[product]['lut'], dtype=np.uint8)
    national = np.zeros(steps+1)
    mun = np.zeros((NM+1)*(steps+1))
    cad = np.zeros((NC+1)*(steps+1))
    pairs = np.zeros((NC+1)*(NM+1), dtype=np.int64)
    circles = {}

    def add_circle(key, lat, lon, radius, codes, mask, row_km2, bbox):
        west, south, east, north = bbox
        n = codes.shape[0]
        dlon, dlat = (east-west)/n, (north-south)/n
        ry, rx = radius/(dlat*111.132), radius/(dlon*111.32*math.cos(math.radians(lat)))
        cy, cx = (north-lat)/dlat, (lon-west)/dlon
        y0, y1 = max(0, int(cy-ry)-1), min(n, int(cy+ry)+2)
        x0, x1 = max(0, int(cx-rx)-1), min(n, int(cx+rx)+2)
        if y0 >= y1 or x0 >= x1:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1]
        inside = ((((yy+.5-cy)/ry)**2+((xx+.5-cx)/rx)**2) <= 1) & mask[y0:y1, x0:x1]
        block = np.where(inside, codes[y0:y1, x0:x1], 0)
        w = np.broadcast_to(row_km2[y0:y1, None], block.shape)
        circles.setdefault(key, np.zeros(steps+1))
        circles[key] += np.bincount(block.ravel(), weights=w.ravel(), minlength=steps+1)[:steps+1]

    centres = [p for p in places if p.get('municipal')]
    for tile in manifest['tiles']:
        bbox = tile['bbox']
        west, south, east, north = bbox
        codes = lut[np.array(Image.open(DATA/f"{product}-{tile['id']}.png"))]
        n = codes.shape[0]
        assert codes.shape == (size, size)
        dlon, dlat = (east-west)/n, (north-south)/n
        lats = north-(np.arange(n)+.5)*dlat
        row_km2 = (dlon*111.32*np.cos(np.radians(lats)))*(dlat*111.132)
        weights = np.broadcast_to(row_km2[:, None], codes.shape)
        mask = country_mask(n, bbox)
        national += np.bincount(np.where(mask, codes, 0).ravel(), weights=weights.ravel(), minlength=steps+1)[:steps+1]

        mun_labels = rasterize(n, bbox, MUN_SHAPES)
        cad_labels = rasterize(n, bbox, CAD_SHAPES) if NC else None
        for r0 in range(0, n, 1024):
            c = codes[r0:r0+1024].astype(np.int64)
            w = weights[r0:r0+1024].ravel()
            m = mun_labels[r0:r0+1024].astype(np.int64)
            mun += np.bincount((m*(steps+1)+c).ravel(), weights=w, minlength=mun.size)
            if NC:
                z = cad_labels[r0:r0+1024].astype(np.int64)
                cad += np.bincount((z*(steps+1)+c).ravel(), weights=w, minlength=cad.size)
                pairs += np.bincount((z*(NM+1)+m).ravel(), minlength=pairs.size)

        # Circles around centres (5 km) and every settlement (1 km): add the part inside this tile.
        margin_lat = MUNICIPAL_RADIUS_KM/111.0
        for p in places:
            radius = MUNICIPAL_RADIUS_KM if p.get('municipal') else PLACE_RADIUS_KM
            margin_lon = radius/(111.32*math.cos(math.radians(p['lat'])))
            if not (west-margin_lon < p['lon'] < east+margin_lon and south-margin_lat < p['lat'] < north+margin_lat):
                continue
            add_circle(('place', p['id']), p['lat'], p['lon'], PLACE_RADIUS_KM, codes, mask, row_km2, bbox)
            if p.get('municipal'):
                add_circle(('centre', p['id']), p['lat'], p['lon'], MUNICIPAL_RADIUS_KM, codes, mask, row_km2, bbox)
        print(f'{product} {tile["id"]}', flush=True)

    cum = lambda counts: np.cumsum(counts[1:steps+1])
    zero = np.zeros(steps+1)
    municipal = {p['id']: cum(circles.get(('centre', p['id']), zero)) for p in centres}
    per_place = {}
    for p in places:
        series = cum(circles.get(('place', p['id']), zero))
        per_place[p['id']] = (series[0]*100, series[-1]*100)  # hectares
    mun_series = np.cumsum(mun.reshape(NM+1, steps+1)[1:, 1:], axis=1)
    cad_series = np.cumsum(cad.reshape(NC+1, steps+1)[1:, 1:], axis=1) if NC else np.zeros((0, steps))
    # Level-1 unit of each level-2 unit = the level-1 unit covering most of its pixels.
    owner = pairs.reshape(NC+1, NM+1)[1:, 1:].argmax(axis=1) if NC else np.zeros(0, dtype=int)
    return cum(national), municipal, per_place, mun_series, cad_series, owner


evo = analyse('evolution', manifest['evolutionSize'])
trk = analyse('tracker', manifest['trackerSize'])

r2 = lambda values: [round(float(v), 2) for v in values]
r4 = lambda values: [round(float(v), 4) for v in values]
r1 = lambda v: round(float(v), 1)
stats = {
    'radius': {'municipal': MUNICIPAL_RADIUS_KM, 'place': PLACE_RADIUS_KM},
    'national': {'evolution': r2(evo[0]), 'tracker': r2(trk[0])},
    'municipal': [{'id': p['id'], 'name': p['name'], 'evolution': r2(evo[1][p['id']]), 'tracker': r2(trk[1][p['id']])}
                  for p in places if p.get('municipal')],
    # id: [ha first, ha last] within 1 km for evolution, then tracker
    'places': {p['id']: [r1(evo[2][p['id']][0]), r1(evo[2][p['id']][1]), r1(trk[2][p['id']][0]), r1(trk[2][p['id']][1])] for p in places},
}
(DATA/'stats.json').write_text(json.dumps(stats, ensure_ascii=False, separators=(',', ':')), encoding='utf8')

mun_ids = [u['id'] for u in units_full['municipalities']]
for i, unit in enumerate(units_web['municipalities']):
    assert unit['id'] == mun_ids[i]
    unit['evolution'], unit['tracker'] = r4(evo[3][i]), r4(trk[3][i])
for i, unit in enumerate(units_web['cadastral']):
    unit['evolution'], unit['tracker'] = r4(evo[4][i]), r4(trk[4][i])
    unit['municipality'] = mun_ids[int(trk[5][i])]
units_web['steps'] = {k: len(v['steps']) for k, v in PERIODS.items()}
(DATA/'units.json').write_text(json.dumps(units_web, ensure_ascii=False, separators=(',', ':')), encoding='utf8')

name = COUNTRY['name']
sum_cad = sum(u['tracker'][-1] for u in units_web['cadastral'])
sum_mun = sum(u['tracker'][-1] for u in units_web['municipalities'])
print(f"{name} (Evolution) {stats['national']['evolution'][0]} → {stats['national']['evolution'][-1]} km²")
print(f"{name} (Tracker) {stats['national']['tracker'][0]} → {stats['national']['tracker'][-1]} km²")
print(f'Kontroll: niveli 1 {sum_mun:.2f} km², niveli 2 {sum_cad:.2f} km² (Tracker, hapi i fundit)')

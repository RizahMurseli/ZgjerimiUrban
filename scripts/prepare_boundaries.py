"""Prepare the two levels of administrative units for one country.

Run from the repository root, after prepare_data.py:
    python scripts/prepare_boundaries.py --country XKX

Kosovo (boundaries: local-xkx), EPSG:9141 KOSOVAREF01 / Balkans zone 7:
    data-src/komunat.geojson.gz          municipal boundaries (fields: ID, MUNICIPALI)
    data-src/zonat-kadastrale.geojson.gz cadastral zones (fields: cadid, cadzonname, municipali)
Other countries (boundaries: geoboundaries): geoBoundaries gbOpen, WGS84. Of the levels listed
in countries.json, the coarsest one with 15–400 units becomes level 1 and the next finer
one with up to 4000 units becomes level 2 (optional).

Output:
    .cache/<ISO3>/units-full.json   full-precision WGS84 rings, used by compute_stats.py
    dist/data/<ISO3>/units.json     simplified, quantised rings for the browser
    dist/data/<ISO3>/places.json    level-1 centres are marked (largest place in each unit)
                                    when the country has no curated list of centres

Needs only numpy: the Kosovo projection is inverted with the Krüger series, so no
GDAL/pyproj install is required on the build machine or in GitHub Actions.
"""
import gzip
import json
import math
from pathlib import Path

import numpy as np

from common import args, fetch, paths, polygons

OPTS, COUNTRY = args('Përgatit kufijtë administrativë për një shtet')
ISO = OPTS.country
OUT, CACHE = paths(ISO)
SRC = Path('data-src')
GEOBOUNDARIES = 'https://www.geoboundaries.org/api/current/gbOpen/{iso}/{level}/'
SIMPLIFY_M = {'municipalities': 25.0, 'cadastral': 12.0}
QUANT = 1e5  # 1e-5° ≈ 1 m

# Fixes for truncated or split names in the municipal layer. Parts that share an
# ID (an exclave, a separate polygon) are merged into one municipality.
MUNICIPAL_NAMES = {'Mitrovicë Verio': 'Mitrovicë e Veriut', 'Shtërpc': 'Shtërpcë',
                   'Kamenicë-Petroc': 'Kamenicë', 'Prishtinë-Shash': 'Prishtinë'}

# --- EPSG:9141 → WGS84 (Transverse Mercator inverse, GRS80; KOSOVAREF01 ≈ ETRS89) ---
A_AXIS, F = 6378137.0, 1/298.257222101
K0, LON0, FE, FN = 0.9999, math.radians(21.0), 7500000.0, 0.0
N = F/(2-F)
A_RECT = A_AXIS/(1+N)*(1+N**2/4+N**4/64)
BETA = [N/2-2/3*N**2+37/96*N**3, N**2/48+N**3/15, 17/480*N**3]
DELTA = [2*N-2/3*N**2-2*N**3, 7/3*N**2-8/5*N**3, 56/15*N**3]


def to_wgs84(xy):
    xy = np.asarray(xy, dtype=float)
    xi = (xy[:, 1]-FN)/(K0*A_RECT)
    eta = (xy[:, 0]-FE)/(K0*A_RECT)
    xi_p, eta_p = xi.copy(), eta.copy()
    for j, b in enumerate(BETA, 1):
        xi_p -= b*np.sin(2*j*xi)*np.cosh(2*j*eta)
        eta_p -= b*np.cos(2*j*xi)*np.sinh(2*j*eta)
    chi = np.arcsin(np.sin(xi_p)/np.cosh(eta_p))
    lat = chi.copy()
    for j, d in enumerate(DELTA, 1):
        lat += d*np.sin(2*j*chi)
    lon = LON0+np.arctan2(np.sinh(eta_p), np.cos(xi_p))
    return np.column_stack([np.degrees(lon), np.degrees(lat)])


def simplify(points, tolerance):
    """Douglas–Peucker on a closed ring in metres; keeps at least 4 points."""
    if len(points) <= 4:
        return points
    keep = np.zeros(len(points), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points)-1)]
    while stack:
        i, j = stack.pop()
        if j <= i+1:
            continue
        a, b = points[i], points[j]
        seg = b-a
        length = math.hypot(*seg)
        rel = points[i+1:j]-a
        if length == 0:
            dist = np.hypot(rel[:, 0], rel[:, 1])
        else:
            dist = np.abs(seg[0]*rel[:, 1]-seg[1]*rel[:, 0])/length
        k = int(np.argmax(dist))
        if dist[k] > tolerance:
            keep[i+1+k] = True
            stack += [(i, i+1+k), (i+1+k, j)]
    out = points[keep]
    return out if len(out) >= 4 else points[np.linspace(0, len(points)-1, 4).astype(int)]


def ring_area(points):
    x, y = points[:, 0], points[:, 1]
    return 0.5*(np.dot(x, np.roll(y, -1))-np.dot(y, np.roll(x, -1)))


class LocalMetres:
    """Equirectangular metres around a fixed point: accurate enough for simplification and areas."""
    def __init__(self, lon0, lat0):
        self.lon0, self.lat0 = lon0, lat0
        self.kx = 111320.0*math.cos(math.radians(lat0))
        self.ky = 110574.0

    def forward(self, ring):
        r = np.asarray(ring, dtype=float)[:, :2]
        return np.column_stack([(r[:, 0]-self.lon0)*self.kx, (r[:, 1]-self.lat0)*self.ky])

    def inverse(self, xy):
        return np.column_stack([xy[:, 0]/self.kx+self.lon0, xy[:, 1]/self.ky+self.lat0])


def encode(ring):
    """Quantised, delta-encoded [lon0,lat0,dlon1,dlat1,…] integers."""
    q = np.round(ring*QUANT).astype(np.int64)
    d = np.vstack([q[:1], np.diff(q, axis=0)])
    return d.ravel().tolist()


def load(name):
    with gzip.open(SRC/name, 'rt', encoding='utf8') as fh:
        return json.load(fh)


def build(features, key, tolerance, forward=lambda r: np.asarray(r, dtype=float)[:, :2], inverse=None):
    """Group features by key; return full rings (WGS84) and simplified encoded rings.
    forward turns a source ring into metres, inverse turns metres into WGS84."""
    to_wgs84_ = inverse or to_wgs84
    groups = {}
    for feature in features:
        k, props = key(feature['properties'])
        g = groups.setdefault(k, dict(props, polys=[], area=0.0))
        for poly in polygons(feature['geometry']):
            rings = [forward(r) for r in poly]
            g['area'] += abs(ring_area(rings[0]))-sum(abs(ring_area(r)) for r in rings[1:])
            g['polys'].append(rings)
    full, web = [], []
    for k, g in groups.items():
        full_polys, web_polys, lons, lats = [], [], [], []
        for rings in g['polys']:
            full_polys.append([to_wgs84_(r).round(7).tolist() for r in rings])
            simple = []
            for i, r in enumerate(rings):
                s = simplify(r, tolerance)
                if i and abs(ring_area(s)) < (3*tolerance)**2:
                    continue  # drop slivers of holes that vanish at web scale
                w = to_wgs84_(s)
                lons += [w[:, 0].min(), w[:, 0].max()]
                lats += [w[:, 1].min(), w[:, 1].max()]
                simple.append(encode(w))
            web_polys.append(simple)
        props = {kk: vv for kk, vv in g.items() if kk not in ('polys', 'area')}
        base = dict(id=k, **props, areaKm2=round(g['area']/1e6, 4))
        full.append(dict(base, polygons=full_polys))
        web.append(dict(base, bbox=[round(min(lons), 5), round(min(lats), 5), round(max(lons), 5), round(max(lats), 5)], rings=web_polys))
    return full, web


def kosovo_units():
    mun = load('komunat.geojson.gz')
    cad = load('zonat-kadastrale.geojson.gz')
    for layer in (mun, cad):
        crs = layer.get('crs', {}).get('properties', {}).get('name', '')
        assert crs.endswith('9141'), f'Pritej EPSG:9141, u gjet {crs}'

    def mun_key(p):
        name = MUNICIPAL_NAMES.get(p['MUNICIPALI'], p['MUNICIPALI'])
        return str(p['ID']), {'name': name}

    def cad_key(p):
        return str(p['cadid']), {'name': p['cadzonname'].strip(), 'sourceMunicipality': p['municipali']}

    mun_full, mun_web = build(mun['features'], mun_key, SIMPLIFY_M['municipalities'])
    cad_full, cad_web = build(cad['features'], cad_key, SIMPLIFY_M['cadastral'])
    return mun_full, mun_web, cad_full, cad_web


def geoboundaries_units():
    """Pick level 1 and level 2 from the geoBoundaries levels listed for the country."""
    work = CACHE/'sources'
    work.mkdir(parents=True, exist_ok=True)
    layers = []
    for level in COUNTRY['levels']:
        meta_path = work/f'gb-{level}.json'
        try:
            fetch(GEOBOUNDARIES.format(iso=ISO, level=level), meta_path)
            meta = json.loads(meta_path.read_text(encoding='utf8'))
            if isinstance(meta, list):
                meta = meta[0]
            path = fetch(meta['gjDownloadURL'], work/f'gb-{level}.geojson')
        except Exception as error:  # a level that does not exist for this country
            print(f'{level}: nuk u gjet ({error.__class__.__name__})', flush=True)
            continue
        layer = json.loads(path.read_text(encoding='utf-8-sig'))
        n = len({f['properties'].get('shapeID') or i for i, f in enumerate(layer['features'])})
        print(f'{level}: {n} njësi · {meta.get("boundarySource", "")} · {meta.get("boundaryLicense", "")}', flush=True)
        layers.append((level, n, layer, meta))
    first = next((l for l in layers if 15 <= l[1] <= 400), None)
    if first is None:
        raise SystemExit('Asnjë nivel me 15–400 njësi: ndrysho "levels" te countries.json.')
    second = next((l for l in layers if l[1] > first[1] and l[1] <= 4000 and l[0] > first[0]), None)
    print(f'Niveli 1 = {first[0]} ({first[1]}), niveli 2 = {second[0] + f" ({second[1]})" if second else "asnjë"}', flush=True)

    lons = [x for f in first[2]['features'] for poly in polygons(f['geometry']) for x, _ in poly[0]]
    lats = [y for f in first[2]['features'] for poly in polygons(f['geometry']) for _, y in poly[0]]
    proj = LocalMetres((min(lons)+max(lons))/2, (min(lats)+max(lats))/2)

    def keyed(layer, prefix):
        """Stable short ids: sorted by shapeID, numbered from 1."""
        feats = sorted(layer['features'], key=lambda f: str(f['properties'].get('shapeID', '')))
        ids, out = {}, []
        for f in feats:
            sid = str(f['properties'].get('shapeID') or len(ids))
            ids.setdefault(sid, prefix+str(len(ids)+1))
            out.append(dict(f, properties=dict(f['properties'], _id=ids[sid])))
        return out

    key = lambda p: (p['_id'], {'name': (p.get('shapeName') or p['_id']).strip()})
    mun_full, mun_web = build(keyed(first[2], ''), key, SIMPLIFY_M['municipalities'], proj.forward, proj.inverse)
    cad_full, cad_web = build(keyed(second[2], 'z'), key, SIMPLIFY_M['cadastral'], proj.forward, proj.inverse) if second else ([], [])
    sources = [dict(level=l[0], units=l[1], source=l[3].get('boundarySource', ''), license=l[3].get('boundaryLicense', ''),
                    year=l[3].get('boundaryYearRepresented', '')) for l in (first, second) if l]
    return mun_full, mun_web, cad_full, cad_web, sources


def inside(lon, lat, rings):
    """Even-odd point-in-polygon test over all rings of a polygon."""
    hit = False
    for ring in rings:
        r = np.asarray(ring)
        x0, y0 = r[:, 0], r[:, 1]
        x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
        cross = ((y0 > lat) != (y1 > lat)) & (lon < (x1-x0)*(lat-y0)/np.where(y1 == y0, 1e-12, y1-y0)+x0)
        hit ^= bool(cross.sum() % 2)
    return hit


def mark_centres(mun_full):
    """Level-1 centres for countries without a curated list: the most populous GeoNames place in each unit."""
    path = OUT/'places.json'
    places = json.loads(path.read_text(encoding='utf8'))
    if any(p.get('municipal') for p in places):
        return
    places.sort(key=lambda p: -p['population'])
    marked = 0
    for unit in mun_full:
        xs = [x for poly in unit['polygons'] for x, _ in poly[0]]
        ys = [y for poly in unit['polygons'] for _, y in poly[0]]
        box = (min(xs), min(ys), max(xs), max(ys))
        best = next((p for p in places if not p.get('municipal') and box[0] <= p['lon'] <= box[2] and box[1] <= p['lat'] <= box[3]
                     and any(inside(p['lon'], p['lat'], poly) for poly in unit['polygons'])), None)
        if best is not None:
            best.update(municipal=True, span=16, unit=unit['id'])
            marked += 1
    places.sort(key=lambda p: (not p.get('municipal', False), -p['population'], p['name']))
    path.write_text(json.dumps(places, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(f'{marked} qendra të njësive të nivelit 1 (vendbanimi më i madh në secilën)', flush=True)


def main():
    if COUNTRY['boundaries'] == 'local-xkx':
        mun_full, mun_web, cad_full, cad_web = kosovo_units()
        sources = [dict(level='komunat', units=len(mun_web), source='AKK', license=''),
                   dict(level='zonat kadastrale', units=len(cad_web), source='AKK', license='')]
    else:
        mun_full, mun_web, cad_full, cad_web, sources = geoboundaries_units()
    (CACHE/'units-full.json').write_text(json.dumps({'municipalities': mun_full, 'cadastral': cad_full}), encoding='utf8')
    for unit in cad_web:
        unit.pop('sourceMunicipality', None)
    web = {'quant': QUANT, 'sources': sources, 'municipalities': mun_web, 'cadastral': cad_web}
    (OUT/'units.json').write_text(json.dumps(web, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    mark_centres(mun_full)
    print(f'{len(mun_web)} njësi të nivelit 1, {len(cad_web)} të nivelit 2 · units.json {(OUT/"units.json").stat().st_size/1e6:.2f} MB')


if __name__ == '__main__':
    main()

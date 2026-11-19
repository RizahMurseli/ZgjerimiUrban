"""Land cover under new construction, year by year, and the land-cover SDG indicators.

Run from the repository root after compute_stats.py:
    python scripts/prepare_landcover.py --country XKX

Source: Esri / Impact Observatory "Sentinel-2 10m Land Use/Land Cover Time Series"
(9 classes, CC BY 4.0): one map per year from 2017, same model for every year. The
script looks for every year from 2017 to the current one, so a newly published year is
picked up by the next run without any change here.

The maps are UTM Cloud Optimized GeoTIFFs (6°×8° grid zones). They are not downloaded:
only the internal tiles that cover the country are read with HTTP range requests.
Every map is sampled onto the WSF Tracker grid (nearest pixel) of each atlas tile.

For every Tracker step, the pixels newly built in that step are classified by the land
cover of the year before construction began (step in January Y → map of Y−2; earlier
than 2017 is not available, so the first step uses 2017 and is marked approximate).

Writes dist/data/<ISO3>/landcover.json with, for the country and every unit of both levels,
  cover      ha of each class in every year
  newBuilt   ha of each class under the construction of every Tracker step
  urban      ha within 100 m of built-up area (latest Tracker step)
  green      ha of trees and rangeland in that urban zone (latest map), not built
"""
import io
import json
import math
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image, ImageFilter

from common import args, bbox_of, burn, mirror_name, paths, polygons, utm_forward

HOST = 'https://lulctimeseries.blob.core.windows.net'
# Esri publishes new years in new containers from time to time; every one listed here is searched.
CONTAINERS = ['lulctimeseriesv003', 'lulctimeseriesv004', 'lulctimeseriesv005', 'lulctimeseriesv006', 'lulctimeseriespublic']
URL = HOST+'/{container}/lc{y}/{tile}_{y}0101-{y1}0101.tif'
FIRST_YEAR = 2017
URBAN_BUFFER_M = 100
# Classes shown in the atlas: key, Albanian label, colour, Esri class codes.
CLASSES = [
    ('forest', 'Pyje', '#3f8f5a', [2]),
    ('range', 'Kullota dhe shkurre', '#b9c46a', [11]),
    ('crop', 'Tokë bujqësore', '#e2b04a', [5]),
    ('built', 'Brenda vendbanimit ekzistues', '#8a8f99', [7]),
    ('bare', 'Tokë e zhveshur', '#c9b8a0', [8]),
    ('water', 'Ujë dhe ligatina', '#4a90c8', [1, 4]),
    ('other', 'Tjetër (borë, re)', '#6b7685', [9, 10]),
]
GREEN = ['forest', 'range']
K = len(CLASSES)
CODE = np.full(256, K, dtype=np.int64)  # Esri code → class index; K = no data
for k, (_, _, _, codes) in enumerate(CLASSES):
    CODE[codes] = k

OPTS, COUNTRY = args('Mbulesa e tokës nën ndërtimet e reja (Esri 10m Land Cover, seri vjetore)',
                     lambda p: p.add_argument('--check', action='store_true', help='vetëm kontrollo: NEWYEAR nëse ka vit të ri, përndryshe SAME'))
DATA, CACHE = paths(OPTS.country)
manifest = json.loads((DATA/'manifest.json').read_text(encoding='utf8'))
boundary = json.loads((DATA/'boundary.json').read_text(encoding='utf8'))
units_full = json.loads((CACHE/'units-full.json').read_text(encoding='utf8')) if not OPTS.check else None
units_web = json.loads((DATA/'units.json').read_text(encoding='utf8'))
period = manifest['periods']['tracker']
steps = period['steps']
lut = np.array(period['lut'], dtype=np.uint8)


# ---------- remote COG access ----------
class RangeFile(io.RawIOBase):
    """Read-only file over HTTP range requests, with a block cache, for tifffile."""
    BLOCK = 1 << 18

    def __init__(self, url):
        self.url, self.pos, self.blocks = url, 0, OrderedDict()
        request = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'atlasi-urban'})
        with urllib.request.urlopen(request, timeout=60) as r:
            self.size = int(r.headers['Content-Length'])

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos+offset if whence == 1 else self.size+offset
        return self.pos

    def _block(self, i):
        if i in self.blocks:
            self.blocks.move_to_end(i)
            return self.blocks[i]
        start, end = i*self.BLOCK, min(self.size, (i+1)*self.BLOCK)-1
        for attempt in range(5):
            try:
                request = urllib.request.Request(self.url, headers={'Range': f'bytes={start}-{end}', 'User-Agent': 'atlasi-urban'})
                with urllib.request.urlopen(request, timeout=120) as r:
                    data = r.read()
                break
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(3*(attempt+1))
        self.blocks[i] = data
        if len(self.blocks) > 512:
            self.blocks.popitem(last=False)
        return data

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size-self.pos
        n = max(0, min(n, self.size-self.pos))
        out = bytearray()
        while len(out) < n:
            i, off = divmod(self.pos+len(out), self.BLOCK)
            out += self._block(i)[off:off+n-len(out)]
        self.pos += n
        return bytes(out)

    def readinto(self, b):
        data = self.read(len(b))
        b[:len(data)] = data
        return len(data)


def open_source(url):
    """A tifffile.TiffFile for a URL, or None when the file does not exist (year not published)."""
    import os
    mirror = os.environ.get('ATLAS_MIRROR')
    try:
        if mirror:
            path = Path(mirror)/mirror_name(url)
            return tifffile.TiffFile(str(path)) if path.exists() else None
        return tifffile.TiffFile(RangeFile(url))
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            return None
        raise


def utm_epsg(tif):
    keys = tif.pages[0].tags[34735].value
    for i in range(4, len(keys), 4):
        if keys[i] == 3072:
            return keys[i+3]
    raise ValueError('pa ProjectedCSTypeGeoKey')


def grid_zones(bounds):
    """MGRS grid zone designators (6° × 8°) that cover a bbox."""
    west, south, east, north = bounds
    letters = 'CDEFGHJKLMNPQRSTUVWX'
    out = []
    for zone in range(int((west+180)//6)+1, int((east+180)//6)+2):
        for b in range(int((south+80)//8), min(19, int((north+80)//8))+1):
            out.append(f'{zone}{letters[b]}')
    return out


def read_window(tif, col0, row0, col1, row1):
    page = tif.pages[0]
    col0, row0, col1, row1 = max(0, col0), max(0, row0), min(page.imagewidth, col1), min(page.imagelength, row1)
    out = np.zeros((max(0, row1-row0), max(0, col1-col0)), dtype=page.dtype)
    if out.size == 0:
        return out
    tw, tl = page.tilewidth, page.tilelength
    across = -(-page.imagewidth//tw)
    fh = tif.filehandle
    for ty in range(row0//tl, (row1-1)//tl+1):
        for tx in range(col0//tw, (col1-1)//tw+1):
            index = ty*across+tx
            if not page.databytecounts[index]:
                continue
            fh.seek(page.dataoffsets[index])
            segment, _, shape = page.decode(fh.read(page.databytecounts[index]), index, jpegtables=page.jpegtables)
            segment = segment.reshape(shape[1], shape[2])
            y0, x0 = ty*tl, tx*tw
            a0, a1, b0, b1 = max(row0, y0), min(row1, y0+tl), max(col0, x0), min(col1, x0+tw)
            out[a0-row0:a1-row0, b0-col0:b1-col0] = segment[a0-y0:a1-y0, b0-x0:b1-x0]
    return out


# ---------- analysis ----------
def list_container(container, zone):
    """Years found by listing a public container (None when listing is not allowed)."""
    import os
    import re
    if os.environ.get('ATLAS_MIRROR'):
        return None
    url = f'{HOST}/{container}?restype=container&comp=list&prefix=lc'
    years, marker = {}, ''
    try:
        while True:
            with urllib.request.urlopen(url+(f'&marker={marker}' if marker else ''), timeout=60) as r:
                xml = r.read().decode('utf8', 'replace')
            for y in re.findall(rf'<Name>lc(\d{{4}})/{zone}_\d{{8}}-\d{{8}}\.tif</Name>', xml):
                years[int(y)] = container
            marker = (re.findall(r'<NextMarker>([^<]*)</NextMarker>', xml) or [''])[0]
            if not marker:
                return years
    except urllib.error.HTTPError:
        return None


def available_years(zones):
    """{year: container} for every published year, newest container winning. Each container is listed
    when possible, otherwise probed year by year; missing years in between are skipped."""
    found = {}
    for container in CONTAINERS:
        listed = list_container(container, zones[0])
        if listed is not None:
            found.update(listed)
            continue
        for y in range(FIRST_YEAR, time.gmtime().tm_year+1):
            tif = open_source(URL.format(container=container, y=y, y1=y+1, tile=zones[0]))
            if tif is not None:
                tif.close()
                found[y] = container
    return dict(sorted(found.items()))


def step_years(years):
    """Map year used for each Tracker step: the year before construction, clamped to the series."""
    out = []
    for i, s in enumerate(steps):
        if i == 0:
            out.append(None)  # baseline (July 2016): already built
            continue
        ideal = steps[i-1]['year']-1
        y = max([v for v in years if v <= ideal] or [years[0]])  # the newest map not after the ideal year
        out.append(dict(label=s['label'], year=y, exact=y == ideal))
    return out


def main():
    zones = grid_zones(manifest['bounds'])
    where = available_years(zones)
    years = list(where)
    if not years:
        raise SystemExit('Asnjë vit i Esri Land Cover nuk u gjet.')
    if OPTS.check:
        old = json.loads((DATA/'landcover.json').read_text(encoding='utf8')).get('years', []) if (DATA/'landcover.json').exists() else []
        print(f'NEWYEAR {OPTS.country} {years[-1]}' if years != old else f'SAME {OPTS.country} {years[-1]}', flush=True)
        return
    print(f'Esri Land Cover: vitet {", ".join(map(str, years))} ({", ".join(sorted(set(where.values())))}), zonat {", ".join(zones)}', flush=True)
    map_year = step_years(years)
    Y, S = len(years), len(steps)
    # Which year index each Tracker code (1..S) uses; −1 = baseline step.
    code_year = np.full(S+1, -1, dtype=np.int64)
    for i, m in enumerate(map_year):
        if m:
            code_year[i+1] = years.index(m['year'])
    sources = {y: [t for t in (open_source(URL.format(container=where[y], y=y, y1=y+1, tile=z)) for z in zones) if t is not None] for y in years}
    projections = {}
    for y in years:
        for tif in sources[y]:
            page = tif.pages[0]
            dx, dy, _ = page.tags[33550].value
            _, _, _, x0, y0, _ = page.tags[33922].value
            epsg = utm_epsg(tif)
            projections[id(tif)] = (x0, y0, dx, dy, epsg % 100, epsg // 100 == 327)

    border_polys = [p for f in boundary['features'] for p in polygons(f['geometry'])]
    levels = {'national': [(1, border_polys, 1, bbox_of(border_polys))]}
    for k in ('municipalities', 'cadastral'):
        levels[k] = [(i+1, u['polygons'], u['areaKm2'], bbox_of(u['polygons'])) for i, u in enumerate(units_full[k])]
    size = {k: len(v)+1 for k, v in levels.items()}
    cover = {k: np.zeros((n, Y, K+1)) for k, n in size.items()}
    built = {k: np.zeros((n, S+1, K+1)) for k, n in size.items()}
    urban = {k: np.zeros(n) for k, n in size.items()}
    green = {k: np.zeros(n) for k, n in size.items()}

    n = manifest['trackerSize']
    for tile in manifest['tiles']:
        west, south, east, north = bbox = tile['bbox']
        codes = lut[np.array(Image.open(DATA/f"tracker-{tile['id']}.png"))].astype(np.int64)
        dlon, dlat = (east-west)/n, (north-south)/n
        lats = north-(np.arange(n)+.5)*dlat
        lons = west+(np.arange(n)+.5)*dlon
        w = np.broadcast_to(((dlon*111.32*np.cos(np.radians(lats)))*(dlat*111.132))[:, None], (n, n)).ravel()
        labels = {k: burn(n, bbox, v, 'L' if k == 'national' else 'I').astype(np.int64).ravel() for k, v in levels.items() if v}
        isbuilt = codes > 0
        zone_px = 2*round(URBAN_BUFFER_M/(dlat*111132))+1
        urb = (np.array(Image.fromarray((isbuilt*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(zone_px))) > 0).ravel()
        cy = code_year[codes].ravel()
        flat_codes = codes.ravel()
        index_cache = {}
        for yi, y in enumerate(years):
            cls = np.full(n*n, K, dtype=np.int64)
            for tif in sources[y]:
                x0, y0, dx, dy, zone, south_h = projections[id(tif)]
                key = (zone, south_h, x0, y0, dx, dy)
                if key not in index_cache:
                    lon2, lat2 = np.meshgrid(lons, lats)
                    E, N = utm_forward(lat2, lon2, zone, south_h)
                    cols = np.floor((E-x0)/dx).astype(np.int64).ravel()
                    rows = np.floor((y0-N)/dy).astype(np.int64).ravel()
                    page = tif.pages[0]
                    ok = (cols >= 0) & (cols < page.imagewidth) & (rows >= 0) & (rows < page.imagelength)
                    index_cache[key] = (cols, rows, ok)
                cols, rows, ok = index_cache[key]
                if not ok.any():
                    continue
                c0, c1, r0, r1 = cols[ok].min(), cols[ok].max()+1, rows[ok].min(), rows[ok].max()+1
                window = read_window(tif, int(c0), int(r0), int(c1), int(r1))
                cls[ok] = CODE[window[rows[ok]-r0, cols[ok]-c0]]
            sel_new = cy == yi
            is_green = np.isin(cls, [i for i, c in enumerate(CLASSES) if c[0] in GREEN]) & urb & ~isbuilt.ravel()
            for k, lab in labels.items():
                m = size[k]
                cover[k][:, yi] += np.bincount(lab*(K+1)+cls, weights=w, minlength=m*(K+1)).reshape(m, K+1)
                key = (lab[sel_new]*(S+1)+flat_codes[sel_new]-1)*(K+1)+cls[sel_new]
                built[k] += np.bincount(key, weights=w[sel_new], minlength=m*(S+1)*(K+1)).reshape(m, S+1, K+1)
                if yi == Y-1:
                    urban[k] += np.bincount(lab[urb], weights=w[urb], minlength=m)
                    green[k] += np.bincount(lab[is_green], weights=w[is_green], minlength=m)
            print(f'mbulesa {tile["id"]} · {y}', flush=True)

    ha = lambda v: round(float(v)*100, 1)

    def pack(k, i):
        return dict(cover=[[ha(v) for v in cover[k][i, yi, :K]] for yi in range(Y)],
                    newBuilt=[[ha(v) for v in built[k][i, s, :K]] for s in range(1, S)],
                    urban=ha(urban[k][i]), green=ha(green[k][i]))
    out = dict(source='Esri / Impact Observatory, Sentinel-2 10m Land Use/Land Cover Time Series (Karra et al. 2021), CC BY 4.0',
               years=years, steps=[m for m in map_year if m], urbanBufferM=URBAN_BUFFER_M,
               classes=[dict(key=k, label=l, color=c) for k, l, c, _ in CLASSES],
               national=pack('national', 1),
               municipalities={u['id']: pack('municipalities', i+1) for i, u in enumerate(units_web['municipalities'])},
               cadastral={u['id']: pack('cadastral', i+1) for i, u in enumerate(units_web['cadastral'])})
    (DATA/'landcover.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    nat = out['national']
    totals = np.array(nat['newBuilt']).sum(axis=0)
    print(f'Ndërtime të reja {out["steps"][0]["label"]} → {out["steps"][-1]["label"]}: {totals.sum():.0f} ha · ' +
          ', '.join(f'{c[1]} {v:.0f} ha' for c, v in zip(CLASSES, totals) if v), flush=True)
    land = sum(nat['cover'][-1])
    print(f'Pyje {years[-1]}: {nat["cover"][-1][0]/max(1, land)*100:.1f} % · gjelbërim urban {nat["green"]/max(1, nat["urban"])*100:.1f} %')


if __name__ == '__main__':
    main()

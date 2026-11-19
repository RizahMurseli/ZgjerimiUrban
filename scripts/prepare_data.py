"""Prepare browser-readable WSF tiles for one country. Run from the repository root.

    python scripts/prepare_data.py --country ALB            full build (first run, or to rebuild everything)
    python scripts/prepare_data.py --country ALB --update   only check DLR for new WSF Tracker steps and,
                                                            if there are any, download the tracker again

The country list, names and boundary sources are in scripts/countries.json.
Output goes to dist/data/<ISO3>/, downloads to .cache/<ISO3>/.

`--update` exits with code 0 and prints UPDATED or UNCHANGED, so a scheduled job
can decide whether to recompute statistics and publish. Nothing about the time
axis is hard-coded in the app: the steps, labels and the code→step table are
written to dist/data/manifest.json from the DLR legend.

Requires pillow, numpy and tifffile. Sources are downloaded from public DLR
endpoints, with three concurrent requests and retries.
"""
import json
import math
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image
import numpy as np

from common import EVOLUTION_SIZE, LEGEND_URL, TRACKER_SIZE, args, fetch, paths, polygons, snap_bounds, tile_grid, tracker_url
# WSF Tracker: legend entry k (1-based) is the half-year snapshot July 2016 + 6·(k-1) months.
TRACKER_START = (2016, 7)
TRACKER_STEP_MONTHS = 6
MONTHS = {1: ('Janar', 'JANAR'), 7: ('Korrik', 'KORRIK')}
GEOBOUNDARIES = 'https://www.geoboundaries.org/api/current/gbOpen/{iso}/{level}/'
WSF_EVO = 'https://download.geoservice.dlr.de/WSF_EVO/files/WSFevolution_v1_{key}/WSFevolution_v1_{key}.tif'
OPTS, COUNTRY = args('Përgatit pllakat WSF për një shtet', lambda p: p.add_argument('--update', action='store_true', help='kontrollo vetëm për hapa të rinj të WSF Tracker'))
ISO = OPTS.country
DATA, SCRATCH = paths(ISO)


def legend_swatches(path):
    """Read the colour of every legend entry, top to bottom, until the swatches stop."""
    legend = Image.open(path).convert('RGBA')
    swatches = []
    for i in range(200):
        y = 32+23*i
        if y >= legend.height:
            break
        color = legend.getpixel((10, y))
        if color[3] < 255 or color[:3] in ((255, 255, 255), (0, 0, 0)) or color in swatches:
            break
        swatches.append(color)
    if len(swatches) < 2:
        raise SystemExit('Legjenda e WSF Tracker nuk u lexua: struktura e saj mund të ketë ndryshuar.')
    return swatches


def tracker_period(raw_steps):
    """Group half-year snapshots into steps: the July 2016 baseline, then every January.
    A trailing July snapshot (newest data) becomes its own last step until the next January."""
    y0, m0 = TRACKER_START
    dates = [(y0*12+m0-1)+TRACKER_STEP_MONTHS*k for k in range(raw_steps)]  # months since year 0
    steps = [dates[0]]+[d for d in dates[1:] if d % 12 == 0]
    if dates[-1] > steps[-1]:
        steps.append(dates[-1])
    lut = [0]*256
    for k, d in enumerate(dates, 1):
        lut[k] = next(i for i, s in enumerate(steps) if s >= d)+1
    labels = []
    for i, s in enumerate(steps):
        year, month = divmod(s, 12)
        name, epoch = MONTHS.get(month+1, (str(month+1), ''))
        labels.append(dict(label=f'{name} {year}', year=year, epoch=epoch+(' · GJENDJA FILLESTARE' if i == 0 else ''),
                           short=str(year)))
    first, last = labels[0], labels[-1]
    return dict(title='2016–'+str(last['year'])+' · WSF Tracker', source='WSF TRACKER · 10 M NË BURIM',
                range=f"{first['label'].lower()} – {last['label'].lower()}", rawSteps=raw_steps, steps=labels, lut=lut)


def evolution_period():
    steps = [dict(label=str(y), year=y, epoch='GJENDJA FILLESTARE' if y == 1985 else '', short=str(y)) for y in range(1985, 2016)]
    return dict(title='1985–2015 · WSF Evolution', source='WSF EVOLUTION · ~30 M', range='1985 – 2015',
                rawSteps=31, steps=steps, lut=list(range(32))+[0]*224)


def build_tracker(tile_list, swatches, force):
    (SCRATCH/'tracker').mkdir(exist_ok=True)
    def one(tile):
        output = DATA/f"tracker-{tile['id']}.png"
        if output.exists() and not force:
            return
        raw = SCRATCH/'tracker'/f"{tile['id']}.png"
        fetch(tracker_url(tile['bbox']), raw, force=force)
        with Image.open(raw) as image:
            assert image.size == (TRACKER_SIZE, TRACKER_SIZE)
            rgba = np.array(image.convert('RGBA'))
        codes = np.zeros(rgba.shape[:2], dtype='uint8')
        for i, color in enumerate(swatches, 1):
            codes[np.all(rgba == color, axis=2)] = i
        unmatched = (codes == 0) & (rgba[:, :, 3] == 255)
        assert not unmatched.any(), f"{int(unmatched.sum())} piksele në pllakën {tile['id']} nuk kanë ngjyrë legjende"
        Image.fromarray(codes).save(output, optimize=True)
        print('Tracker '+tile['id'], flush=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(one, tile_list))


def country_info():
    keep = ('name', 'in', 'of', 'whole', 'show', 'short', 'mark', 'atlas', 'presets', 'unit1', 'unit2', 'unitsNote')
    return dict(id=ISO, **{k: COUNTRY[k] for k in keep if k in COUNTRY})


def write_manifest(bounds, tile_list, tracker):
    manifest = dict(country=country_info(), bounds=bounds, tiles=tile_list, trackerSize=TRACKER_SIZE, evolutionSize=EVOLUTION_SIZE,
                    periods=dict(evolution=evolution_period(), tracker=tracker),
                    updated=time.strftime('%Y-%m-%d'))
    (DATA/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf8')


def update():
    """Compare the live legend with the published manifest; rebuild the tracker if it grew."""
    SCRATCH.mkdir(exist_ok=True)
    fetch(LEGEND_URL, SCRATCH/'legend.png', force=True)
    swatches = legend_swatches(SCRATCH/'legend.png')
    manifest = json.loads((DATA/'manifest.json').read_text(encoding='utf8'))
    current = manifest.get('periods', {}).get('tracker', {}).get('rawSteps', 20)
    if len(swatches) == current and 'periods' in manifest:
        print(f'UNCHANGED · WSF Tracker ka ende {current} hapa gjashtëmujorë', flush=True)
        return
    print(f'UPDATED · WSF Tracker: {current} → {len(swatches)} hapa gjashtëmujorë', flush=True)
    tile_list = manifest['tiles']
    build_tracker(tile_list, swatches, force=True)
    write_manifest(manifest['bounds'], tile_list, tracker_period(len(swatches)))


def full():
    work = SCRATCH/'sources'
    work.mkdir(parents=True, exist_ok=True)
    code = COUNTRY['geonames']
    fetch(f'https://download.geonames.org/export/dump/{code}.zip', work/f'{code}.zip')
    with zipfile.ZipFile(work/f'{code}.zip') as archive:
        (work/f'geonames-{code}.txt').write_bytes(archive.read(f'{code}.txt'))
    fetch(GEOBOUNDARIES.format(iso=ISO, level='ADM0'), work/'boundary-meta.json')
    metadata = json.loads((work/'boundary-meta.json').read_text(encoding='utf8'))
    fetch(metadata['gjDownloadURL'], work/'boundary.geojson')
    fetch(LEGEND_URL, work/'legend.png', force=True)
    boundary = json.loads((work/'boundary.geojson').read_text(encoding='utf-8-sig'))
    lons = [x for f in boundary['features'] for poly in polygons(f['geometry']) for x, _ in poly[0]]
    lats = [y for f in boundary['features'] for poly in polygons(f['geometry']) for _, y in poly[0]]
    bounds = COUNTRY.get('bounds') or snap_bounds(min(lons), min(lats), max(lons), max(lats))
    WEST, SOUTH, EAST, NORTH = bounds
    print(f'{COUNTRY["name"]}: kufiri {min(lons):.3f}–{max(lons):.3f} E, {min(lats):.3f}–{max(lats):.3f} N → pllakat {bounds}', flush=True)
    # WSF Evolution comes in 2°×2° files named by their south-west corner (even degrees).
    keys = [f'{lon}_{lat}' for lon in range(math.floor(WEST/2)*2, math.ceil(EAST/2)*2, 2)
            for lat in range(math.floor(SOUTH/2)*2, math.ceil(NORTH/2)*2, 2)]
    for key in keys:
        fetch(WSF_EVO.format(key=key), work/f'wsf-{key}.tif')

    # Reduce the display outline while retaining the full-resolution source boundary.
    step = max(1, sum(len(p[0]) for f in boundary['features'] for p in polygons(f['geometry']))//4000)
    for feature in boundary['features']:
        geometry = feature['geometry']
        polys = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
        for poly in polys:
            for i, ring in enumerate(poly):
                sampled = ring[::step]
                if sampled[-1] != sampled[0]:
                    sampled.append(sampled[0])
                poly[i] = sampled
    (DATA/'boundary.json').write_text(json.dumps(boundary, separators=(',', ':')), encoding='utf8')

    places = []
    for line in (work/f'geonames-{code}.txt').read_text(encoding='utf8').splitlines():
        r = line.split('\t')
        if r[6] != 'P':
            continue
        lat, lon = map(float, r[4:6])
        if not (SOUTH < lat < NORTH and WEST < lon < EAST):
            continue
        if r[0] == '791122':  # Prizren: the GeoNames point lies outside the town
            lat, lon = 42.06158, 20.65337
        places.append(dict(id=r[0], name=r[1], aliases=r[3], lat=lat, lon=lon, population=int(r[14] or 0)))
    # Albanian names of municipal centres take precedence over source labels. Countries without
    # a curated list get their centres from prepare_boundaries.py (largest place in each unit).
    windows = json.loads(Path(COUNTRY['windows']).read_text(encoding='utf8')) if COUNTRY.get('windows') else []
    for entry in windows:
        match = next((p for p in places if p['id'] == entry['geonames_id']), None)
        if match is None:
            match = dict(id=entry['geonames_id'], aliases='', population=0)
            places.append(match)
        match.update(name=entry['name'], lat=entry['lat'], lon=entry['lon'], span=entry['span'], municipal=True)
    places.sort(key=lambda p: (not p.get('municipal', False), -p['population'], p['name']))
    (DATA/'places.json').write_text(json.dumps(places, ensure_ascii=False, separators=(',', ':')), encoding='utf8')

    import tifffile
    tile_list = tile_grid(bounds)
    swatches = legend_swatches(work/'legend.png')
    build_tracker(tile_list, swatches, force=False)
    for tile in tile_list:
        output = DATA/f"evolution-{tile['id']}.png"
        if output.exists():
            continue
        x0, y0, x1, y1 = tile['bbox']
        size = EVOLUTION_SIZE
        xs = x0+(np.arange(size)+.5)*(x1-x0)/size
        ys = y1-(np.arange(size)+.5)*(y1-y0)/size
        codes = np.zeros((size, size), dtype='uint8')
        covered = np.zeros_like(codes, dtype=bool)
        for key in keys:
            with tifffile.TiffFile(work/f'wsf-{key}.tif') as tif:
                page = tif.pages[0]
                dx, dy, _ = page.tags[33550].value
                _, _, _, tx, ty, _ = page.tags[33922].value
                cols = np.floor((xs-tx)/dx).astype(int)
                rows = np.floor((ty-ys)/dy).astype(int)
                cx = (cols >= 0) & (cols < page.imagewidth)
                ry = (rows >= 0) & (rows < page.imagelength)
                if cx.any() and ry.any():
                    values = page.asarray()[np.ix_(rows[ry], cols[cx])]
                    codes[np.ix_(ry, cx)] = np.where((values >= 1985) & (values <= 2015), values-1984, 0)
                    covered[np.ix_(ry, cx)] = True
        assert covered.all(), f"pllaka {tile['id']} nuk mbulohet plotësisht nga skedarët WSF Evolution"
        Image.fromarray(codes).save(output, optimize=True)
        print('Evolution '+tile['id'], flush=True)
    write_manifest(bounds, tile_list, tracker_period(len(swatches)))
    print(f'{len(places)} vendbanime, {2*len(tile_list)} pllaka të të dhënave, {len(swatches)} hapa të Tracker.', flush=True)


if __name__ == '__main__':
    update() if OPTS.update else full()

"""Population per level-1 unit, for the sustainability tab (SDG 11.3.1).

Run from the repository root after prepare_boundaries.py:
    python scripts/prepare_population.py --country ALB

Sources
  ghspop   GHS-POP R2023A (JRC), modelled residential population, 3 arc-seconds,
           five-yearly epochs. Downloaded per 10°×10° tile and summed inside each unit.
  census   optional national census figures (countries.json → "census"), e.g. the
           Kosovo 2011 and 2024 censuses. Census is the default source when present.

Writes dist/data/<ISO3>/population.json.
"""
import io
import json
import math
import zipfile

import numpy as np
import tifffile
from PIL import Image, ImageDraw

from common import args, fetch, paths, polygons

EPOCHS = [1990, 2000, 2010, 2015, 2020, 2025]
GHS = ('https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/'
       'GHS_POP_E{e}_GLOBE_R2023A_4326_3ss/V1-0/tiles/GHS_POP_E{e}_GLOBE_R2023A_4326_3ss_V1_0_R{r}_C{c}.zip')
RES = 1/1200  # 3 arc-seconds

def options(p):
    p.add_argument('--epochs', default=','.join(map(str, EPOCHS)))
    p.add_argument('--skip-ghs', action='store_true', help='vetëm regjistrimi, pa shkarkuar GHS-POP')


OPTS, COUNTRY = args('Popullsia sipas njësive (GHS-POP dhe regjistrimi)', options)
DATA, CACHE = paths(OPTS.country)
epochs = [int(e) for e in OPTS.epochs.split(',')]
manifest = json.loads((DATA/'manifest.json').read_text(encoding='utf8'))
units_full = json.loads((CACHE/'units-full.json').read_text(encoding='utf8'))
boundary = json.loads((DATA/'boundary.json').read_text(encoding='utf8'))
west, south, east, north = manifest['bounds']
# Analysis grid: the country bounds snapped to the 3″ GHS grid.
gx0, gy1 = math.floor(west/RES)*RES, math.ceil(north/RES)*RES
nx, ny = math.ceil((east-gx0)/RES), math.ceil((gy1-south)/RES)


def tiles_needed():
    """GHS 4326 tiles are 10°×10°: row 1 starts at 90°N, column 1 at 180°W."""
    rows = range(int((90-north)//10)+1, int((90-south)//10)+2)
    cols = range(int((west+180)//10)+1, int((east+180)//10)+2)
    return [(r, c) for r in rows for c in cols]


def read_epoch(epoch):
    grid = np.zeros((ny, nx), dtype=np.float32)
    covered = np.zeros((ny, nx), dtype=bool)
    (CACHE/'ghs').mkdir(exist_ok=True)
    for r, c in tiles_needed():
        url = GHS.format(e=epoch, r=r, c=c)
        path = CACHE/'ghs'/url.rsplit('/', 1)[1]
        try:
            fetch(url, path)
        except Exception as error:
            print(f'  pllaka R{r}_C{c} mungon ({error.__class__.__name__}): e kapërcej', flush=True)
            continue
        with zipfile.ZipFile(path) as archive:
            name = next(n for n in archive.namelist() if n.lower().endswith('.tif'))
            with tifffile.TiffFile(io.BytesIO(archive.read(name))) as tif:
                page = tif.pages[0]
                dx, dy, _ = page.tags[33550].value
                _, _, _, tx, ty, _ = page.tags[33922].value
                # Window of this tile that falls inside the analysis grid.
                col0 = max(0, round((gx0-tx)/dx)); col1 = min(page.imagewidth, round((gx0+nx*RES-tx)/dx))
                row0 = max(0, round((ty-gy1)/dy)); row1 = min(page.imagelength, round((ty-(gy1-ny*RES))/dy))
                if col0 >= col1 or row0 >= row1:
                    continue
                values = page.asarray()[row0:row1, col0:col1].astype(np.float32)
        values[~np.isfinite(values) | (values < 0)] = 0
        gc0, gr0 = round((tx+col0*dx-gx0)/RES), round((gy1-(ty-row0*dy))/RES)
        grid[gr0:gr0+values.shape[0], gc0:gc0+values.shape[1]] = values
        covered[gr0:gr0+values.shape[0], gc0:gc0+values.shape[1]] = True
    return grid, covered


def labels():
    image = Image.new('I', (nx, ny), 0)
    draw = ImageDraw.Draw(image)
    px = lambda ring: [((lon-gx0)/RES, (gy1-lat)/RES) for lon, lat in ring]
    for i, unit in sorted(enumerate(units_full['municipalities']), key=lambda t: -t[1]['areaKm2']):
        for poly in unit['polygons']:
            draw.polygon(px(poly[0]), fill=i+1)
            for hole in poly[1:]:
                draw.polygon(px(hole), fill=0)
    return np.array(image)


def country_mask():
    image = Image.new('L', (nx, ny), 0)
    draw = ImageDraw.Draw(image)
    for f in boundary['features']:
        for poly in polygons(f['geometry']):
            for k, ring in enumerate(poly):
                draw.polygon([((lon-gx0)/RES, (gy1-lat)/RES) for lon, lat in ring], fill=255 if k == 0 else 0)
    return np.array(image) > 127


def main():
    units = units_full['municipalities']
    series = {u['id']: [] for u in units}
    national = []
    run = [] if OPTS.skip_ghs else epochs
    if run:
        lab = labels()
        mask = country_mask()
    for epoch in run:
        grid, covered = read_epoch(epoch)
        if not covered[lab > 0].all():
            raise SystemExit(f'GHS-POP {epoch}: disa njësi nuk mbulohen nga pllakat e shkarkuara')
        sums = np.bincount(lab.ravel(), weights=grid.ravel(), minlength=len(units)+1)
        for i, u in enumerate(units):
            series[u['id']].append(int(round(sums[i+1])))
        national.append(int(round(grid[mask].sum())))
        print(f'GHS-POP {epoch}: {national[-1]:,} banorë brenda kufirit', flush=True)

    out = dict(sources={} if OPTS.skip_ghs else {'ghspop': dict(label='GHS-POP R2023A (e modeluar)', years=epochs,
                                        source='Schiavina et al. (2023), GHS-POP R2023A, JRC. doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE',
                                        note='Popullsi e modeluar: shpërndahet në rrjet sipas zonave të ndërtuara, ndaj krahasimi me zonën e ndërtuar është pjesërisht qarkor. 2025 është projeksion.',
                                        national=national)},
               default='ghspop', municipalities={u['id']: dict(name=u['name'], **({} if OPTS.skip_ghs else {'ghspop': series[u['id']]})) for u in units})
    if not out['sources'] and not COUNTRY.get('census'):
        raise SystemExit('Asnjë burim popullsie.')
    if COUNTRY.get('census'):
        census = json.loads(open(COUNTRY['census'], encoding='utf8').read())
        out['sources']['census'] = dict(label='Regjistrimi', years=census['years'], dates=census.get('dates'),
                                        source=census['source'], note=census.get('note', ''))
        out['default'] = 'census'
        for uid, row in census['municipalities'].items():
            if uid in out['municipalities']:
                out['municipalities'][uid]['census'] = row['pop']
                if row.get('estimate'):
                    out['municipalities'][uid]['estimate'] = True
    (DATA/'population.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(f'population.json: {len(units)} njësi, burimet {", ".join(out["sources"])}', flush=True)


if __name__ == '__main__':
    main()

"""Offline end-to-end test of the country-pack pipeline.

    python scripts/test_pipeline.py

Builds a fictional country "TST" from synthetic sources served through
ATLAS_MIRROR (GeoNames, geoBoundaries, the DLR legend, WSF Evolution GeoTIFFs,
WSF Tracker WMS images and GHS-POP tiles), runs every script, and checks that the
outputs agree with the synthetic truth. Nothing is downloaded. The test pack is
written to dist/data/TST and removed at the end unless --keep is given.
"""
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from common import LEGEND_URL, ROOT, TRACKER_SIZE, mirror_name, snap_bounds, tile_grid, tracker_url, utm_forward  # noqa: E402

KEEP = '--keep' in sys.argv
ISO = 'TST'
W, S, E, N = 20.05, 41.05, 20.85, 41.65          # the fictional country (a rectangle)
GRID1, GRID2 = (4, 5), (8, 10)                   # level 1: 20 units, level 2: 80 units
EPOCHS = [1990, 2000, 2010, 2015, 2020, 2025]
SWATCHES = [(30+9*i, 200-7*i, 90+5*i, 255) for i in range(21)]
rng = np.random.default_rng(7)


def put(mirror, url, data):
    path = mirror/mirror_name(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data if isinstance(data, bytes) else data.encode('utf8'))


def rect_features(nx, ny, prefix):
    feats = []
    for j in range(ny):
        for i in range(nx):
            x0, x1 = W+(E-W)*i/nx, W+(E-W)*(i+1)/nx
            y0, y1 = S+(N-S)*j/ny, S+(N-S)*(j+1)/ny
            ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
            feats.append(dict(type='Feature', properties=dict(shapeName=f'{prefix} {j}-{i}', shapeID=f'TST-{prefix}-{j:02d}{i:02d}'),
                              geometry=dict(type='Polygon', coordinates=[ring])))
    return dict(type='FeatureCollection', features=feats)


def geotiff(values, x0, y1, res, dtype, tile=None):
    buf = io.BytesIO()
    tifffile.imwrite(buf, values.astype(dtype), compression='zlib', tile=tile, extratags=[
        (33550, 'd', 3, (res, res, 0.0), True),
        (33922, 'd', 6, (0.0, 0.0, 0.0, x0, y1, 0.0), True)])
    return buf.getvalue()


def build_mirror(mirror, config_path):
    config = dict(TST=dict(name='Testlandia', **{'in': 'në Testlandi'}, of='e Testlandisë', whole='Gjithë Testlandia', show='Shfaq gjithë Testlandinë',
                          short='TESTLANDI', mark='T', atlas='Atlasi urban i Testlandisë', geonames='ZZ', boundaries='geoboundaries',
                          levels=['ADM1', 'ADM2', 'ADM3'],
                          unit1=dict(one='komunë', many='komuna', One='Komuna', Many='Komunat', the='komunat', acc='komunën'),
                          unit2=dict(one='njësi', many='njësi', One='Njësia', Many='Njësitë', short='Nj'), unitsNote='Kufij testues.'))
    config_path.write_text(json.dumps(config, ensure_ascii=False), encoding='utf8')
    # GeoNames: one town at the centre of each level-1 unit, plus villages.
    rows = []
    nx, ny = GRID1
    for j in range(ny):
        for i in range(nx):
            lon, lat = W+(E-W)*(i+.5)/nx, S+(N-S)*(j+.5)/ny
            rows.append([str(1000+j*nx+i), f'Qyteti {j}-{i}', '', '', f'{lat:.5f}', f'{lon:.5f}', 'P', 'PPLA2'] + ['']*6 + [str(5000+300*(j*nx+i))] + ['']*4)
    for k in range(60):
        lon, lat = rng.uniform(W, E), rng.uniform(S, N)
        rows.append([str(2000+k), f'Fshati {k}', '', '', f'{lat:.5f}', f'{lon:.5f}', 'P', 'PPL'] + ['']*6 + ['0'] + ['']*4)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('ZZ.txt', '\n'.join('\t'.join(r) for r in rows))
    put(mirror, 'https://download.geonames.org/export/dump/ZZ.zip', buf.getvalue())
    # geoBoundaries: ADM0, ADM1 (20), ADM2 (80); ADM3 is missing on purpose.
    for level, layer in (('ADM0', rect_features(1, 1, 'Testlandia')), ('ADM1', rect_features(*GRID1, 'Komuna')), ('ADM2', rect_features(*GRID2, 'Njësia'))):
        gj = f'https://github.com/test/geoBoundaries/raw/main/TST-{level}.geojson'
        put(mirror, f'https://www.geoboundaries.org/api/current/gbOpen/TST/{level}/',
            json.dumps(dict(boundaryISO='TST', boundaryType=level, gjDownloadURL=gj, boundarySource='Test', boundaryLicense='CC0')))
        put(mirror, gj, json.dumps(layer))
    # DLR legend: swatches at x=10, y=32+23·k, then white.
    legend = Image.new('RGBA', (60, 32+23*len(SWATCHES)+20), (255, 255, 255, 255))
    for k, c in enumerate(SWATCHES):
        for y in range(32+23*k-6, 32+23*k+7):
            for x in range(4, 18):
                legend.putpixel((x, y), c)
    b = io.BytesIO(); legend.save(b, 'PNG'); put(mirror, LEGEND_URL, b.getvalue())
    # WSF Evolution: year of first detection on a coarse 0.003° grid, built-up in the eastern half only.
    res = 0.003
    for lon in (18, 20):
        for lat in (40, 42):
            n = round(2/res)
            yy, xx = np.mgrid[0:n, 0:n]
            lons = lon+(xx+.5)*res
            year = np.where(lons > (W+E)/2, 1985+(yy*31//n), 0)
            put(mirror, f'https://download.geoservice.dlr.de/WSF_EVO/files/WSFevolution_v1_{lon}_{lat}/WSFevolution_v1_{lon}_{lat}.tif',
                geotiff(year, lon, lat+2, res, np.uint16))
    # WSF Tracker WMS: legend colour k in the western half, by row band.
    bounds = snap_bounds(W, S, E, N)
    for tile in tile_grid(bounds):
        x0, y0, x1, y1 = tile['bbox']
        img = np.zeros((TRACKER_SIZE, TRACKER_SIZE, 4), dtype=np.uint8)
        lons = x0+(np.arange(TRACKER_SIZE)+.5)*(x1-x0)/TRACKER_SIZE
        west_half = lons < (W+E)/2
        band = (np.arange(TRACKER_SIZE)*len(SWATCHES)//TRACKER_SIZE)
        for k in range(len(SWATCHES)):
            rows_k = band == k
            img[np.ix_(rows_k, west_half)] = SWATCHES[k]
        b = io.BytesIO(); Image.fromarray(img, 'RGBA').save(b, 'PNG', compress_level=1)
        put(mirror, tracker_url(tile['bbox']), b.getvalue())
    # Esri 10m Land Cover, 2017–2019 (2020 missing on purpose): crops north of the country's middle,
    # trees south of it. UTM 34N, 30 m grid, tiled, with a GeoKey directory naming EPSG:32634.
    E0, N1 = utm_forward(np.array(40.8), np.array(19.9), 34)
    E1, N0 = utm_forward(np.array(41.8), np.array(21.5), 34)
    e0, n1 = math.floor(min(E0, utm_forward(np.array(41.8), np.array(19.9), 34)[0])/30)*30, math.ceil(N0/30)*30
    width, height = math.ceil((float(E1)+3000-e0)/30), math.ceil((n1-float(N1)+3000)/30)
    mid = utm_forward(np.array((S+N)/2), np.array((W+E)/2), 34)[1]
    north_rows = (n1-(np.arange(height)+.5)*30) > mid
    values = np.broadcast_to(np.where(north_rows, 5, 2)[:, None], (height, width)).astype(np.uint8)
    for year in (2017, 2018, 2019):
        buf = io.BytesIO()
        tifffile.imwrite(buf, values, compression='zlib', tile=(256, 256), extratags=[
            (33550, 'd', 3, (30.0, 30.0, 0.0), True),
            (33922, 'd', 6, (0.0, 0.0, 0.0, float(e0), float(n1), 0.0), True),
            (34735, 'H', 12, (1, 1, 0, 2, 1024, 0, 1, 1, 3072, 0, 1, 32634), True)])
        put(mirror, f'https://lulctimeseries.blob.core.windows.net/lulctimeseriesv003/lc{year}/34T_{year}0101-{year+1}0101.tif', buf.getvalue())
    # GHS-POP: 10 persons per 3″ cell inside the country (×1.1 every five years), tile R5_C21 covering 20–21E, 41–42N.
    for e, epoch in enumerate(EPOCHS):
        n = 1200
        yy, xx = np.mgrid[0:n, 0:n]
        lon, lat = 20+(xx+.5)/n, 42-(yy+.5)/n
        inside = (lon > W) & (lon < E) & (lat > S) & (lat < N)
        pop = np.where(inside, 10*1.1**e, -200)
        name = f'GHS_POP_E{epoch}_GLOBE_R2023A_4326_3ss_V1_0_R5_C21'
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr(name+'.tif', geotiff(pop, 20.0, 42.0, 1/1200, np.float32))
        put(mirror, f'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E{epoch}_GLOBE_R2023A_4326_3ss/V1-0/tiles/{name}.zip', buf.getvalue())


def run(script, env):
    print(f'\n$ python scripts/{script} --country {ISO}', flush=True)
    subprocess.run([sys.executable, str(ROOT/'scripts'/script), '--country', ISO], check=True, env=env, cwd=ROOT)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        mirror, config_path = tmp/'mirror', tmp/'countries.json'
        build_mirror(mirror, config_path)
        env = dict(os.environ, ATLAS_MIRROR=str(mirror), ATLAS_COUNTRIES=str(config_path))
        for script in ('prepare_data.py', 'prepare_boundaries.py', 'prepare_population.py', 'compute_stats.py', 'prepare_landcover.py'):
            run(script, env)
        update = subprocess.run([sys.executable, str(ROOT/'scripts/prepare_data.py'), '--country', ISO, '--update'],
                                check=True, env=env, cwd=ROOT, capture_output=True, text=True).stdout
        data = ROOT/'dist/data'/ISO
        units = json.loads((data/'units.json').read_text(encoding='utf8'))
        stats = json.loads((data/'stats.json').read_text(encoding='utf8'))
        pop = json.loads((data/'population.json').read_text(encoding='utf8'))
        manifest = json.loads((data/'manifest.json').read_text(encoding='utf8'))
        lc = json.loads((data/'landcover.json').read_text(encoding='utf8'))
        nb = np.array(lc['national']['newBuilt']).sum(axis=0)
        area = (E-W)*(N-S)*111.32*np.cos(np.radians((S+N)/2))*111.132
        evo, trk = stats['national']['evolution'], stats['national']['tracker']
        checks = [
            ('20 njësi në nivelin 1', len(units['municipalities']) == 20),
            ('80 njësi në nivelin 2', len(units['cadastral']) == 80),
            ('çdo njësi e nivelit 2 i përket një njësie të nivelit 1', all(u.get('municipality') for u in units['cadastral'])),
            ('Evolution 2015 ≈ gjysma lindore', abs(evo[-1]-area/2)/(area/2) < .03),
            ('Tracker hapi i fundit ≈ gjysma perëndimore', abs(trk[-1]-area/2)/(area/2) < .03),
            ('Evolution rritet çdo vit', all(b >= a for a, b in zip(evo, evo[1:]))),
            ('niveli 1 = niveli 2 = kombëtare (Tracker)', abs(sum(u['tracker'][-1] for u in units['municipalities'])-trk[-1]) < .05
             and abs(sum(u['tracker'][-1] for u in units['cadastral'])-trk[-1]) < .05),
            ('20 qendra të njësive', sum(1 for p in json.loads((data/'places.json').read_text(encoding='utf8')) if p.get('municipal')) == 20),
            ('--update pa hapa të rinj jep UNCHANGED', update.startswith('UNCHANGED')),
            ('hapat e Tracker nga legjenda', manifest['periods']['tracker']['rawSteps'] == len(SWATCHES)),
            ('GHS-POP: popullsia ×1.1 çdo 5 vjet', all(abs(b/a-1.1) < .01 for a, b in zip(pop['sources']['ghspop']['national'][3:], pop['sources']['ghspop']['national'][4:]))),
            ('Esri: vitet 2017–2019 (2020 mungon)', lc['years'] == [2017, 2018, 2019]),
            ('Esri: ndërtimet e reja = shtesa e Tracker pas korrikut 2016', abs(nb.sum()/((trk[-1]-trk[0])*100)-1) < .02),
            ('Esri: vetëm pyje dhe tokë bujqësore, të dyja > 0', nb[0] > 0 and nb[2] > 0 and abs(nb[0]+nb[2]-nb.sum()) < 1),
            ('Esri: pyjet ≈ gjysma e territorit', abs(lc['national']['cover'][-1][0]/sum(lc['national']['cover'][-1])-.5) < .03),
            ('Esri: hapi i parë i përafërt, të tjerët me vitin para ndërtimit', not lc['steps'][0]['exact'] and lc['steps'][1]['year'] == 2017),
            ('Esri: njësitë e nivelit 1 mblidhen në kombëtaren', abs(sum(np.array(u['newBuilt']).sum() for u in lc['municipalities'].values())/nb.sum()-1) < .01),
            ('GHS-POP: shuma e njësive = kombëtare', abs(sum(r['ghspop'][-1] for r in pop['municipalities'].values())/pop['sources']['ghspop']['national'][-1]-1) < .01),
        ]
        for label, ok in checks:
            print(('OK    ' if ok else 'GABIM ')+label)
        if not KEEP:
            shutil.rmtree(data, ignore_errors=True)
            shutil.rmtree(ROOT/'.cache'/ISO, ignore_errors=True)
        if not all(ok for _, ok in checks):
            raise SystemExit(1)
        print('\nTë gjitha kontrollet kaluan.')


if __name__ == '__main__':
    main()

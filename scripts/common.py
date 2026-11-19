"""Shared settings for the country-pack scripts.

Every script takes --country ISO3 (default XKX) and works in
    dist/data/<ISO3>/   browser data for that country
    .cache/<ISO3>/      downloads and full-precision intermediate files

Set ATLAS_MIRROR=/path/to/dir to read every download from a local folder
instead of the network (used by the offline test in scripts/test_pipeline.py).
"""
import argparse
import hashlib
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads(Path(os.environ.get('ATLAS_COUNTRIES', ROOT/'scripts/countries.json')).read_text(encoding='utf8'))
WMS = 'https://geoservice.dlr.de/eoc/land/wms'
LEGEND_URL = WMS+'?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetLegendGraphic&LAYER=WSF_TRACKER&FORMAT=image/png'
# Tile grid shared by every country: 0.475° × 0.3775° per tile, as in the original Kosovo build.
TILE_W, TILE_H = 0.475, 0.3775
TRACKER_SIZE, EVOLUTION_SIZE = 4096, 1536


def args(description, extra=None):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument('--country', default='XKX', choices=sorted(CONFIG), help='kodi ISO3 i shtetit')
    if extra:
        extra(parser)
    a = parser.parse_args()
    return a, CONFIG[a.country]


def paths(iso):
    data = ROOT/'dist/data'/iso
    cache = ROOT/'.cache'/iso
    data.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    return data, cache


def mirror_name(url):
    """File name a mirrored URL is stored under: host/path, plus a hash when there is a query."""
    rest = url.split('://', 1)[1]
    path, _, query = rest.partition('?')
    if query:
        path += '__'+hashlib.sha1(query.encode()).hexdigest()[:16]
    return path


def fetch(url, path, force=False):
    path = Path(path)
    if path.exists() and not force:
        return path
    mirror = os.environ.get('ATLAS_MIRROR')
    if mirror:
        source = Path(mirror)/mirror_name(url)
        if not source.exists():
            raise FileNotFoundError(f'{url} (pritej te {source})')
        path.write_bytes(source.read_bytes())
        return path
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'atlasi-urban (github actions)'})
            with urllib.request.urlopen(request, timeout=180) as response:
                tmp = path.with_suffix(path.suffix+'.part')
                with open(tmp, 'wb') as out:
                    while chunk := response.read(1 << 20):
                        out.write(chunk)
                tmp.replace(path)
            return path
        except urllib.error.HTTPError as error:
            if 400 <= error.code < 500 or attempt == 3:  # missing files do not appear on retry
                raise
            time.sleep(5*(attempt+1))
        except Exception:
            if attempt == 3:
                raise
            time.sleep(5*(attempt+1))


def snap_bounds(west, south, east, north, pad=0.05):
    """Expand a bbox to a whole number of atlas tiles, anchored at the north-west corner."""
    west, north = math.floor((west-pad)*100)/100, math.ceil((north+pad)*100)/100
    cols = max(1, math.ceil((east+pad-west)/TILE_W-1e-9))
    rows = max(1, math.ceil((north-south+pad)/TILE_H-1e-9))
    return [round(west, 4), round(north-rows*TILE_H, 4), round(west+cols*TILE_W, 4), round(north, 4)]


def tile_grid(bounds):
    west, south, east, north = bounds
    cols = round((east-west)/TILE_W)
    rows = round((north-south)/TILE_H)
    out = []
    for row in range(rows):
        for col in range(cols):
            x0, x1 = west+TILE_W*col, west+TILE_W*(col+1)
            y1, y0 = north-TILE_H*row, north-TILE_H*(row+1)
            out.append(dict(id=f'{row}-{col}', bbox=[round(x0, 6), round(y0, 6), round(x1, 6), round(y1, 6)]))
    return out


def tracker_url(bbox):
    params = dict(SERVICE='WMS', VERSION='1.1.1', REQUEST='GetMap', LAYERS='WSF_TRACKER', STYLES='', SRS='EPSG:4326',
                  BBOX=','.join(map(str, bbox)), WIDTH=TRACKER_SIZE, HEIGHT=TRACKER_SIZE, FORMAT='image/png', TRANSPARENT='TRUE')
    return WMS+'?'+urllib.parse.urlencode(params)


def polygons(geometry):
    return [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']


def bbox_of(polys):
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    return min(xs), min(ys), max(xs), max(ys)


def burn(n, bbox, shapes, mode='I'):
    """Burn (label, polygons, areaKm2, bbox) shapes into an n×n image of one atlas tile; largest first so enclaves survive."""
    from PIL import Image, ImageDraw
    import numpy as np
    west, south, east, north = bbox
    image = Image.new(mode, (n, n), 0)
    draw = ImageDraw.Draw(image)
    px = lambda ring: [((lon-west)/(east-west)*n, (north-lat)/(north-south)*n) for lon, lat in ring]
    for label, polys, _, box in sorted(shapes, key=lambda s: -s[2]):
        if not (box[0] < east and west < box[2] and box[1] < north and south < box[3]):
            continue
        for poly in polys:
            draw.polygon(px(poly[0]), fill=label)
            for hole in poly[1:]:
                draw.polygon(px(hole), fill=0)
    return np.array(image)


def read_window(path, col0, row0, col1, row1):
    """Read a pixel window of a (tiled or striped) GeoTIFF, decoding only the tiles it touches."""
    import numpy as np
    import tifffile
    with tifffile.TiffFile(path) as tif:
        page = tif.pages[0]
        col0, row0 = max(0, col0), max(0, row0)
        col1, row1 = min(page.imagewidth, col1), min(page.imagelength, row1)
        if not page.is_tiled:
            return page.asarray()[row0:row1, col0:col1]
        out = np.zeros((max(0, row1-row0), max(0, col1-col0)), dtype=page.dtype)
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
                a0, a1 = max(row0, y0), min(row1, y0+tl)
                b0, b1 = max(col0, x0), min(col1, x0+tw)
                out[a0-row0:a1-row0, b0-col0:b1-col0] = segment[a0-y0:a1-y0, b0-x0:b1-x0]
        return out


def geotransform(path):
    """(x0, y0, dx, dy) of the upper-left corner and pixel size of a north-up GeoTIFF."""
    import tifffile
    with tifffile.TiffFile(path) as tif:
        page = tif.pages[0]
        dx, dy, _ = page.tags[33550].value
        _, _, _, x0, y0, _ = page.tags[33922].value
        return x0, y0, dx, dy, page.imagewidth, page.imagelength


def tm_forward(lat, lon, lon0, k0, fe, fn, a=6378137.0, f=1/298.257223563):
    """Geographic → Transverse Mercator (Krüger series), metres. Defaults: WGS84 ellipsoid."""
    import numpy as np
    n = f/(2-f)
    A = a/(1+n)*(1+n**2/4+n**4/64)
    al = [n/2-2*n**2/3+5*n**3/16, 13*n**2/48-3*n**3/5, 61*n**3/240]
    phi, lam = np.radians(lat), np.radians(np.asarray(lon)-lon0)
    c = 2*math.sqrt(n)/(1+n)
    t = np.sinh(np.arctanh(np.sin(phi))-c*np.arctanh(c*np.sin(phi)))
    xi, eta = np.arctan2(t, np.cos(lam)), np.arctanh(np.sin(lam)/np.sqrt(1+t*t))
    E, N = eta.copy(), xi.copy()
    for j, aj in enumerate(al, start=1):
        E += aj*np.cos(2*j*xi)*np.sinh(2*j*eta)
        N += aj*np.sin(2*j*xi)*np.cosh(2*j*eta)
    return fe+k0*A*E, fn+k0*A*N


def utm_forward(lat, lon, zone, south=False):
    """WGS84 → UTM, metres."""
    return tm_forward(lat, lon, zone*6-183, 0.9996, 500000, 10000000 if south else 0)


# Projected systems that local rasters may use (Transverse Mercator parameters).
TM_SYSTEMS = {
    9141: dict(lon0=21, k0=0.9999, fe=7500000, fn=0, a=6378137.0, f=1/298.257222101),  # KOSOVAREF01 / Balkans zone 7 (GRS80)
}

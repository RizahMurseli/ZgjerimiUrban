const $ = id => document.getElementById(id);
const base = [99,112,139];
const annual = [[75,227,241],[62,138,255],[165,115,255],[246,112,218],[255,173,204],[139,231,98],[240,236,79],[255,183,61],[255,124,54],[255,67,86]];
const state = {period:'evolution',index:0,lat:42.67272,lon:21.16688,span:16,name:'Prishtina',playing:false,mode:'cumulative',compareIndex:0,split:.5,tab:'zone',basemap:true,radial:true,basemapSource:'osm',basemapMode:'dark',basemapTransp:30};
let places = [], manifest, boundary, sample, mask, generation = 0, timer, view, stats, viewStats;
let selectedPlace, lastStats = null;
// Country pack: data/<ISO3>/…; C holds the names and unit terms from manifest.country.
let BASE = 'data/', C = null, countries = [];
const defaultPlace = () => places.find(p => p.municipal) || places[0];
function wholeView() {
  const [w,s,e,n] = manifest.bounds, lat = (s+n)/2;
  return {lat,lon:(w+e)/2,span:Math.round(Math.max((e-w)*111.32*Math.cos(lat*Math.PI/180),(n-s)*111.13)*1.13)};
}
function applyCountryText() {
  const set = (id,text) => { const el = $(id);if (el) el.textContent = text; };
  document.title = 'Zgjerimi urban '+C.in;
  document.querySelector('meta[name=description]')?.setAttribute('content',`Eksploro historinë e zgjerimit urban të çdo vendbanimi ${C.in}, nga të dhënat satelitore të DLR.`);
  set('brandMark',C.mark);set('brandRegion','/ '+C.short);
  $('heroTitle').innerHTML = `Zgjerimi urban<br>${esc(C.in)}<span>.</span>`;
  $('whole').firstChild.textContent = C.show+' ';
  for (const el of document.querySelectorAll('.signature')) el.textContent = '© Rizah Murseli · '+C.atlas;
  set('unitsNote',C.unitsNote || '');
  $('offlineLink').href = C.id === 'XKX' ? 'kosova-urban.html' : `atlas-${C.id.toLowerCase()}.html`;
  set('citeText',`Murseli, R. (2026). Zgjerimi urban ${C.in}: atlas interaktiv i zonave të ndërtuara, 1985–2026. Të dhënat: DLR World Settlement Footprint.`);
  $('overview').setAttribute('aria-label','Kliko për të zgjedhur një pikë '+C.in);
  set('tabNation',C.name);set('nationEvoTitle',C.whole+' · 1985–2015');set('nationTrkTitle',C.whole+' · 2016–2026');
  set('munLabelText','1 · '+C.unit1.Many);set('zoneLabelText','2 · '+C.unit2.Many);
  const centres = places.filter(p => p.municipal).length;
  set('raceStory',`${centres} qendrat e ${C.unit1.many.replace(/a$/,'ave').replace(/i$/,'ive')}, krahasuar në rreze të njëjtë prej 5 km nga qendra. Renditja ndjek vitin në kohëzgjatje; luaje animacionin për ta parë garën.`);
  set('tabRace','Gara 5 km');
  const presetPlaces = (C.presets || []).map(n => places.find(p => p.name === n)).filter(Boolean);
  $('presets').innerHTML = (presetPlaces.length ? presetPlaces : places.filter(p => p.municipal).slice(0,3)).map(p => `<button data-place="${esc(p.name)}">${esc(p.name)}</button>`).join('');
  for (const b of $('presets').querySelectorAll('[data-place]')) b.onclick = () => { const place = places.find(p => p.name === b.dataset.place);if (place) selectPlace(place); };
  const sel = $('country');
  sel.innerHTML = countries.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.value = C.id;
  $('countryBox').hidden = countries.length < 2;
}
const cache = new Map();
const RADIAL = {lens:.27,inner:.305,outer:.455,span:66};
const canvas = $('map');
const context = canvas.getContext('2d');
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Time axis comes from manifest.json, so new WSF Tracker steps need no code change.
const period = (name=state.period) => manifest.periods[name];
const count = () => period().steps.length;
const stepYear = i => period().steps[i].year;
const yearLabel = (i,name) => period(name).steps[i].label;
const stepIndexOfYear = (year,name) => period(name).steps.findIndex(s => s.year === year && !/^Korrik/.test(s.label));
const number = value => new Intl.NumberFormat('sq',{maximumFractionDigits:2}).format(value);
const interpolate = (a,b,t) => a.map((v,i) => Math.round(v+(b[i]-v)*t));
function colors(name=state.period) {
  const n = period(name).steps.length-1;
  return [base,...Array.from({length:n},(_,i) => {
    const t = n === 1 ? 0 : i/(n-1)*9, start = Math.floor(t);
    return interpolate(annual[start],annual[Math.min(start+1,9)],t-start);
  })];
}
function stop() {
  state.playing = false;
  clearTimeout(timer);
  $('play').innerHTML = '▶ <span>Luaj</span>';
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!state.playing) return;
    if (state.index >= count()-1) { stop(); return; }
    state.index++;
    paint();
    schedule();
  },Number($('speed').value));
}
function setIndex(index) {
  stop();
  state.index = index;
  paint();
}
function pathFor(ctx, transform) {
  ctx.beginPath();
  for (const feature of boundary.features) {
    const geometry = feature.geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) {
      ring.forEach(([lon,lat],index) => {
        const [x,y] = transform(lon,lat);
        if (index) ctx.lineTo(x,y); else ctx.moveTo(x,y);
      });
      ctx.closePath();
    }
  }
}
function updateView() {
  const rect = canvas.getBoundingClientRect();
  // One uniform scale for both axes, so the canvas is never stretched unevenly on large screens.
  const ratio = Math.min(1.5,window.devicePixelRatio || 1,1400/Math.max(1,rect.width),1200/Math.max(1,rect.height));
  canvas.width = Math.max(1,Math.round(rect.width*ratio));
  canvas.height = Math.max(1,Math.round(rect.height*ratio));
  const size = Math.min(canvas.width,canvas.height);
  const dx = state.span/2/(111.32*Math.cos(state.lat*Math.PI/180));
  const dy = state.span/2/111.132;
  view = {west:state.lon-dx,east:state.lon+dx,south:state.lat-dy,north:state.lat+dy,size,
    x:(canvas.width-size)/2,y:(canvas.height-size)/2};
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskCanvas.height = size;
  const ctx = maskCanvas.getContext('2d',{willReadFrequently:true});
  pathFor(ctx,(lon,lat) => [(lon-view.west)/(view.east-view.west)*size,(view.north-lat)/(view.north-view.south)*size]);
  ctx.fillStyle = '#fff';
  ctx.fill('evenodd');
  mask = ctx.getImageData(0,0,size,size).data;
  $('extentValue').textContent = state.span > 30 ? C.whole : state.span.toFixed(0)+' × '+state.span.toFixed(0)+' km';
  $('extent').value = Math.min(30,state.span);
  $('coordinates').textContent = state.lat.toFixed(5)+'° N · '+state.lon.toFixed(5)+'° E';
  $('locationName').textContent = state.name;
  $('mapName').textContent = state.name.toUpperCase();
}
async function tileData(tile, size) {
  const key = state.period+':'+tile.id+':'+size;
  if (cache.has(key)) return cache.get(key);
  const period = state.period;
  const request = (async () => {
    const response = await fetch(BASE+period+'-'+tile.id+'.png');
    if (!response.ok) throw new Error('Pllaka e të dhënave nuk u ngarkua.');
    const bitmap = await createImageBitmap(await response.blob());
    const offscreen = document.createElement('canvas');
    offscreen.width = offscreen.height = size;
    const ctx = offscreen.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap,0,0,size,size);
    bitmap.close();
    const pixels = ctx.getImageData(0,0,size,size).data;
    const lut = manifest.periods[period].lut;
    const values = new Uint8Array(size*size);
    for (let i=0;i<values.length;i++) {
      const code = pixels[i*4];
      values[i] = lut[code];
    }
    offscreen.width = offscreen.height = 1;
    return {values,size};
  })();
  cache.set(key,request);
  // Bound browser memory when exploring several distant areas.
  if (cache.size > 10) cache.delete(cache.keys().next().value);
  try { return await request; } catch(error) { cache.delete(key); throw error; }
}
async function loadView() {
  stop();
  const token = ++generation;
  sample = null;
  $('total').textContent = '—';
  $('growth').textContent = '—';
  $('scale').style.visibility = 'hidden';
  $('play').disabled = true;
  $('status').hidden = false;
  $('status').textContent = 'Duke ngarkuar zonën…';
  viewStats = null;
  updateView();
  context.fillStyle = '#070c14';
  context.fillRect(0,0,canvas.width,canvas.height);
  overview();
  const v = {...view};
  const grid = new Uint8Array(v.size*v.size);
  try {
    const visible = manifest.tiles.filter(tile => {
      const [w,s,e,n] = tile.bbox;
      return e>v.west && w<v.east && n>v.south && s<v.north;
    });
    for (const tile of visible) {
      if (token !== generation) return;
      const [west,south,east,north] = tile.bbox;
      const native = state.period === 'evolution' ? manifest.evolutionSize : manifest.trackerSize;
      const target = Math.max(256,Math.min(native,2**Math.ceil(Math.log2(v.size*(east-west)/(v.east-v.west)))));
      const {values,size} = await tileData(tile,target);
      if (token !== generation) return;
      const x0 = Math.max(0,Math.ceil((west-v.west)/(v.east-v.west)*v.size-.5));
      const x1 = Math.min(v.size,Math.ceil((east-v.west)/(v.east-v.west)*v.size-.5));
      const y0 = Math.max(0,Math.ceil((v.north-north)/(v.north-v.south)*v.size-.5));
      const y1 = Math.min(v.size,Math.ceil((v.north-south)/(v.north-v.south)*v.size-.5));
      for (let y=y0;y<y1;y++) {
        const lat = v.north-(y+.5)/v.size*(v.north-v.south);
        const row = Math.max(0,Math.min(size-1,Math.floor((north-lat)/(north-south)*size)));
        for (let x=x0;x<x1;x++) {
          const lon = v.west+(x+.5)/v.size*(v.east-v.west);
          const col = Math.max(0,Math.min(size-1,Math.floor((lon-west)/(east-west)*size)));
          const index = y*v.size+x;
          if (mask[index*4+3] > 127) grid[index] = values[row*size+col];
        }
      }
    }
    if (token !== generation) return;
    sample = grid;
    viewStats = computeViewStats(grid,v);
    showFilterState();
    $('status').hidden = true;
    $('play').disabled = false;
    paint();
    updateHash();
  } catch(error) {
    if (token !== generation) return;
    $('status').textContent = 'Ngarkimi dështoi. ';
    const retry = document.createElement('button');
    retry.textContent = 'Provo përsëri';
    retry.onclick = loadView;
    $('status').append(retry);
    console.error(error);
  }
}
function buildLegend() {
  const palette = colors();
  $('legend').replaceChildren();
  palette.forEach((color,i) => {
    const button = document.createElement('button');
    button.style.setProperty('--color','rgb('+color.join(',')+')');
    button.textContent = count() <= 13 || stepYear(i)%5 === 0 ? period().steps[i].short : '';
    button.title = yearLabel(i);
    button.setAttribute('aria-label','Shfaq '+yearLabel(i));
    button.onclick = () => setIndex(i);
    $('legend').append(button);
  });
  $('time').max = count()-1;
  $('compareYear').replaceChildren(...Array.from({length:count()},(_,i) => new Option(yearLabel(i),String(i))));
  state.compareIndex = Math.min(state.compareIndex,count()-1);
  $('compareYear').value = state.compareIndex;
  renderRace(true);
  $('mapPeriod').textContent = period().source;
}
function paint(mapOnly=false) {
  const palette = colors();
  const color = palette[state.index];
  $('year').textContent = stepYear(state.index);
  $('year').style.color = 'rgb('+color.join(',')+')';
  $('epoch').textContent = period().steps[state.index].epoch;
  $('time').value = state.index;
  [...$('legend').children].forEach((element,i) => {
    element.classList.toggle('active',i === state.index);
    element.classList.toggle('future',i > state.index);
  });
  if (!mapOnly) updateAnalytics();
  if (!sample) { renderRadial();return; }
  const pixels = new ImageData(view.size,view.size);
  let total = 0, added = 0;
  const mode = state.mode, size = view.size;
  const split = mode === 'compare' ? Math.round(state.split*canvas.width-view.x) : -1;
  // Over a dark base map the land tint is strong; over RGB or panchromatic imagery it stays light so the image shows.
  const tint = !state.basemap ? 255 : state.basemapMode === 'dark' ? 150 : 45, seaTint = !state.basemap ? 255 : state.basemapMode === 'dark' ? 215 : 120;
  const land = [13,23,39,tint], sea = [7,12,20,seaTint], dim = [52,64,84,255];
  for (let i=0;i<sample.length;i++) {
    const code = sample[i];
    const index = mode === 'compare' && i%size < split ? state.compareIndex : state.index;
    const detected = code && code <= index+1;
    const outside = filterMask && !filterMask.data[i];
    let c;
    if (!detected) c = mask[i*4+3] > 127 ? land : sea;
    else if (mode === 'added') c = code === index+1 || index === 0 ? palette[code-1] : dim;
    else c = palette[code-1];
    // Outside the filter only the base-year built-up area is drawn, in its usual grey, for orientation.
    if (outside) c = code === 1 ? palette[0] : mask[i*4+3] > 127 ? [10,16,27,!state.basemap ? 255 : state.basemapMode === 'dark' ? 150 : 95] : sea;
    pixels.data.set(c,i*4);
    pixels.data[i*4+3] = c.length === 4 ? c[3] : 255;
    if (outside) continue;
    if (code && code <= state.index+1) total++;
    if (state.index && code === state.index+1) added++;
  }
  context.fillStyle = '#070c14';
  context.fillRect(0,0,canvas.width,canvas.height);
  if (state.basemap) drawBasemap();
  if (layer.width !== view.size) layer.width = layer.height = view.size;
  layer.getContext('2d').putImageData(pixels,0,0);
  context.imageSmoothingEnabled = false;
  context.drawImage(layer,view.x,view.y);
  drawUnits();
  pathFor(context,(lon,lat) => [view.x+(lon-view.west)/(view.east-view.west)*view.size,view.y+(view.north-lat)/(view.north-view.south)*view.size]);
  context.strokeStyle = '#34445c';
  context.lineWidth = .8;
  context.stroke();
  const area = (state.span/view.size)**2;
  $('total').textContent = number(total*area)+' km²';
  lastStats = {total:total*area,added:added*area};
  $('totalLabel').textContent = !filterMask ? 'Zonë e ndërtuar në pamje' : filterMask.kind === 'circle' ? 'Zonë e ndërtuar brenda rrethit' : filterMask.circle ? 'Zonë e ndërtuar brenda rrethit dhe filtrit' : 'Zonë e ndërtuar brenda filtrit';
  $('growth').textContent = state.index ? '+'+number(added*area)+' km²' : 'Gjendja fillestare';
  const scaleKm = state.span > 60 ? 20 : state.span > 15 ? 5 : state.span > 5 ? 2 : 1;
  $('scale').firstElementChild.style.width = (scaleKm/state.span*view.size*canvas.clientWidth/canvas.width)+'px';
  $('scale').lastElementChild.textContent = scaleKm+' km';
  $('scale').style.visibility = 'visible';
  if (mode === 'compare') {
    $('divider').style.left = (state.split*100)+'%';
    $('divider').setAttribute('aria-valuenow',Math.round(state.split*100));
    $('compareB').textContent = 'Djathtas '+yearLabel(state.index);
  }
  overview();
  renderRadial();
}
const layer = document.createElement('canvas');
// ---------- OpenStreetMap background ----------
// Change this constant to use another tile provider (keep its attribution in index.html).
// OpenStreetMap's own servers refuse requests without a web address (a file opened from disk),
// so the offline file uses CARTO's rendering of the same OpenStreetMap data.
const LOCAL_FILE = location.protocol === 'file:';
// Base-map sources. Change or add providers here; keep their attribution in BASEMAP_CREDIT.
const TILE_URLS = {
  osm:LOCAL_FILE ? 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  esri:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};
const BASEMAP_CREDIT = {
  osm:{html:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">kontribuuesit e OpenStreetMap</a>'+(LOCAL_FILE ? ' · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' : ''),text:'Harta bazë © OpenStreetMap'+(LOCAL_FILE ? ', CARTO' : '')},
  esri:{html:'Imazhi © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics',text:'Imazhi satelitor © Esri, Maxar, Earthstar Geographics'},
};
const BASEMAP_FILTER = {dark:'grayscale(1) invert(1) brightness(.5) contrast(.8)',pan:'grayscale(1) contrast(1.08) brightness(.9)',rgb:'none'};
const tiles = new Map();
let repaintFrame;
function schedulePaint() {
  cancelAnimationFrame(repaintFrame);
  repaintFrame = requestAnimationFrame(() => paint(true));
}
function tileImage(z,x,y) {
  const source = state.basemapSource, key = source+'/'+z+'/'+x+'/'+y;
  let image = tiles.get(key);
  if (!image) {
    image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = schedulePaint;
    image.onerror = () => { image.failed = true; };
    image.src = TILE_URLS[source].replace('{z}',z).replace('{x}',x).replace('{y}',y);
    tiles.set(key,image);
    if (tiles.size > 400) tiles.delete(tiles.keys().next().value);
  }
  return image;
}
function drawBasemap() {
  const metersPerPixel = state.span*1000/view.size;
  const z = Math.max(6,Math.min(18,Math.round(Math.log2(156543.03*Math.cos(state.lat*Math.PI/180)/metersPerPixel))));
  const n = 2**z;
  const tileX = lon => (lon+180)/360*n;
  const tileY = lat => (1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n;
  const lonOf = x => x/n*360-180;
  const latOf = y => Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
  const x0 = Math.floor(tileX(view.west)), x1 = Math.floor(tileX(view.east));
  const y0 = Math.floor(tileY(view.north)), y1 = Math.floor(tileY(view.south));
  if ((x1-x0+1)*(y1-y0+1) > 80) return;
  const sx = lon => view.x+(lon-view.west)/(view.east-view.west)*view.size;
  const sy = lat => view.y+(view.north-lat)/(view.north-view.south)*view.size;
  context.save();
  context.beginPath();
  context.rect(view.x,view.y,view.size,view.size);
  context.clip();
  // Display mode (dark, RGB or panchromatic) and transparency chosen in the side panel.
  const filtered = 'filter' in context;
  if (filtered) context.filter = BASEMAP_FILTER[state.basemapMode];
  context.globalAlpha = 1-state.basemapTransp/100;
  context.imageSmoothingEnabled = true;
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) {
    const image = tileImage(z,x,y);
    if (!image.complete || !image.naturalWidth) continue;
    const left = sx(lonOf(x)), top = sy(latOf(y));
    context.drawImage(image,left,top,sx(lonOf(x+1))-left+.5,sy(latOf(y+1))-top+.5);
  }
  context.filter = 'none';
  context.globalAlpha = 1;
  if (!filtered && state.basemapMode === 'dark') { context.fillStyle = 'rgba(7,12,20,.6)';context.fillRect(view.x,view.y,view.size,view.size); }
  context.restore();
}
function overview() {
  const ctx = $('overview').getContext('2d');
  const [west,south,east,north] = manifest.bounds;
  const xy = (lon,lat) => [8+(lon-west)/(east-west)*104,8+(north-lat)/(north-south)*124];
  ctx.clearRect(0,0,120,140);
  pathFor(ctx,xy);
  ctx.fillStyle = '#1b2c40';ctx.fill('evenodd');
  ctx.strokeStyle = '#617b9c';ctx.lineWidth = .7;ctx.stroke();
  const [x,y] = xy(state.lon,state.lat);
  ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle = '#66e0d1';ctx.fill();
}
function selectPlace(place) {
  selectedPlace = place;
  Object.assign(state,{lat:place.lat,lon:place.lon,name:place.name,span:place.span || 5});
  $('search').value = place.name;
  hideResults();
  loadView();
}
function hideResults() {
  $('results').hidden = true;
  $('search').setAttribute('aria-expanded','false');
}
function searchPlaces() {
  const query = normalize($('search').value.trim());
  const matches = query ? places.filter(p => normalize(p.name+' '+p.aliases).includes(query)).sort((a,b) => Number(normalize(b.name).startsWith(query))-Number(normalize(a.name).startsWith(query))) : places.filter(p => p.municipal);
  $('results').replaceChildren();
  for (const place of matches.slice(0,30)) {
    const button = document.createElement('button');
    button.setAttribute('role','option');
    const title = document.createElement('span'); title.textContent = place.name;
    const subtitle = document.createElement('small');
    subtitle.textContent = (place.municipal ? `Qendër · ${C.unit1.one} · ` : '')+place.lat.toFixed(3)+'° N, '+place.lon.toFixed(3)+'° E';
    button.append(title,subtitle);
    button.onclick = () => selectPlace(place);
    $('results').append(button);
  }
  if (!matches.length) {
    const p = document.createElement('p');p.textContent = 'Emri nuk u gjet. Mund të zgjedhësh pikën në hartën e vogël.';$('results').append(p);
  }
  $('results').hidden = false;
  $('search').setAttribute('aria-expanded','true');
}
function updateHash() {
  const params = new URLSearchParams({c:C.id,lat:state.lat.toFixed(5),lon:state.lon.toFixed(5),km:String(state.span),p:state.period,name:state.name,m:state.mode,b:state.basemap ? state.basemapSource : '0',bm:state.basemapMode,bt:String(state.basemapTransp),r:state.radial ? '1' : '0',u:state.unitsOverlay ? '1' : '0'});
  if (state.tab !== 'zone') params.set('t',state.tab);
  if (MUN.size) params.set('mun',[...MUN].join('.'));
  if (ZONE.size && ZONE.size <= 60) params.set('zk',[...ZONE].join('.'));
  history.replaceState(null,'','#'+params.toString());
}
function pointAt(lon,lat) {
  const [bw,bs,be,bn] = manifest.bounds;
  if (lon < bw || lon > be || lat < bs || lat > bn) return;
  Object.assign(state,{lon,lat,name:'Zonë e zgjedhur'});
  $('search').value = '';
  loadView();
}
function zoom(factor) {
  state.span = Math.max(2,Math.min(190,state.span*factor));
  loadView();
}
$('search').addEventListener('input',searchPlaces);
$('search').addEventListener('focus',searchPlaces);
$('search').addEventListener('keydown',event => {
  if (event.key === 'Escape') hideResults();
  if (event.key === 'ArrowDown') { event.preventDefault();$('results').querySelector('button')?.focus(); }
  if (event.key === 'Enter') $('results').querySelector('button')?.click();
});
$('results').addEventListener('keydown',event => {
  if (event.key === 'Escape') { hideResults();$('search').focus(); }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const buttons = [...$('results').querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    buttons[(i+(event.key === 'ArrowDown' ? 1 : buttons.length-1))%buttons.length]?.focus();
  }
});
document.addEventListener('click',event => { if (!event.target.closest('.search-wrap')) hideResults(); });
$('country').onchange = () => { location.hash = 'c='+$('country').value;location.reload(); };
$('period').onchange = () => { state.period = $('period').value;state.index = state.compareIndex = 0;sample = null;viewStats = null;buildLegend();paint();loadView(); };
$('extent').oninput = () => { $('extentValue').textContent = $('extent').value+' × '+$('extent').value+' km'; };
$('extent').onchange = () => { state.span = Number($('extent').value);loadView(); };
$('whole').onclick = () => { Object.assign(state,wholeView(),{name:C.whole});loadView(); };
$('time').oninput = () => setIndex(Number($('time').value));
$('speed').onchange = () => { if (state.playing) schedule(); };
$('play').onclick = () => {
  if (state.playing) { stop();return; }
  if (!sample) return;
  if (state.index >= count()-1) { state.index = 0;paint(); }
  state.playing = true;
  $('play').innerHTML = 'Ⅱ <span>Ndalo</span>';
  schedule();
};
$('zoomIn').onclick = () => zoom(.75);
$('zoomOut').onclick = () => zoom(1.4);
$('reset').onclick = () => selectPlace(selectedPlace || defaultPlace());
$('aboutToggle').onclick = () => {
  $('about').hidden = !$('about').hidden;
  $('aboutToggle').setAttribute('aria-expanded',String(!$('about').hidden));
  $('aboutToggle').lastElementChild.textContent = $('about').hidden ? '+' : '−';
};
$('overview').onclick = event => {
  const rect = $('overview').getBoundingClientRect();
  const x = (event.clientX-rect.left)/rect.width*120;
  const y = (event.clientY-rect.top)/rect.height*140;
  const [west,south,east,north] = manifest.bounds;
  if (state.span > 30) state.span = 10;
  pointAt(west+(x-8)/104*(east-west),north-(y-8)/124*(north-south));
};
let drag, wheelTimer, resizeTimer;
canvas.onpointerdown = event => { drag = {x:event.clientX,y:event.clientY,lon:state.lon,lat:state.lat};canvas.setPointerCapture(event.pointerId);$('tip').hidden = true; };
canvas.onpointerup = event => {
  if (!drag) return;
  const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
  if (Math.hypot(dx,dy)>4) {
    const scale = canvas.clientWidth/canvas.width;
    pointAt(drag.lon-dx/(view.size*scale)*(view.east-view.west),drag.lat+dy/(view.size*scale)*(view.north-view.south));
  } else if (units && state.unitsOverlay) {
    // A click (no drag) selects or deselects the unit under the pointer.
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX-rect.left)*canvas.width/rect.width-view.x, y = (event.clientY-rect.top)*canvas.height/rect.height-view.y;
    clickUnitAt(view.west+x/view.size*(view.east-view.west),view.north-y/view.size*(view.north-view.south));
  }
  drag = null;
};
canvas.onpointercancel = () => { drag = null; };
canvas.ondblclick = event => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX-rect.left)*canvas.width/rect.width-view.x;
  const y = (event.clientY-rect.top)*canvas.height/rect.height-view.y;
  pointAt(view.west+x/view.size*(view.east-view.west),view.north-y/view.size*(view.north-view.south));
};
canvas.addEventListener('wheel',event => {
  event.preventDefault();
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => zoom(event.deltaY>0 ? 1.25 : .8),90);
},{passive:false});
window.addEventListener('resize',() => { clearTimeout(resizeTimer);resizeTimer = setTimeout(loadView,200); });
// The map box can change size without a window resize (side panel content, tabs, fonts), so watch it directly.
if (window.ResizeObserver) {
  let lastBox = '';
  new ResizeObserver(entries => {
    const r = entries[0].contentRect, key = Math.round(r.width)+'x'+Math.round(r.height);
    if (key === lastBox) return;
    const first = !lastBox; lastBox = key;
    if (first || !view) return;
    clearTimeout(resizeTimer);resizeTimer = setTimeout(loadView,150);
  }).observe(canvas);
}
let openTab = null;
async function start() {
  try {
    countries = await fetch('data/countries.json').then(r => r.ok ? r.json() : null).catch(() => null) || [{id:'XKX',name:'Kosova'}];
    const wanted = new URLSearchParams(location.hash.slice(1)).get('c');
    BASE = 'data/'+(countries.find(c => c.id === wanted) || countries[0]).id+'/';
    const responses = await Promise.all(['places','manifest','boundary'].map(name => fetch(BASE+name+'.json').then(r => { if(!r.ok) throw new Error(name); return r.json(); })));
    [places,manifest,boundary] = responses;
    C = manifest.country;
    stats = await fetch(BASE+'stats.json').then(r => r.ok ? r.json() : null).catch(() => null);
    units = await fetch(BASE+'units.json').then(r => r.ok ? r.json() : null).then(raw => raw && decodeUnits(raw)).catch(error => { console.error(error);return null; });
    population = await fetch(BASE+'population.json').then(r => r.ok ? r.json() : null).catch(() => null);
    landcover = await fetch(BASE+'landcover.json').then(r => r.ok ? r.json() : null).catch(() => null);
    soil = await fetch(BASE+'soil.json').then(r => r.ok ? r.json() : null).catch(() => null);
    applyCountryText();
    if (units && !units.cadastral.length) $('zonePick').closest('.cascade').classList.add('single-level');
    if (population && !population.sources) population = null;  // old format
    if (units && population) {
      popSource = population.default || Object.keys(population.sources)[0];
      for (const u of units.municipalities) { const p = population.municipalities[u.id];if (p) u.pop = {estimate:!!p.estimate}; }
    }
    if (!units || !population) document.querySelector('[data-tab=sdg]').hidden = true;
    for (const option of $('period').options) option.textContent = manifest.periods[option.value].title;
    if (manifest.updated) $('dataUpdated').textContent = ` (përditësimi i fundit: ${manifest.updated})`;
    if (units) {
    } else {
      $('toggleUnits').hidden = true;
      document.querySelector('[data-tab=units]').hidden = true;
    }
    const hash = new URLSearchParams(location.hash.slice(1));
    const lat = Number(hash.get('lat')),lon = Number(hash.get('lon')),km = Number(hash.get('km'));
    selectedPlace = defaultPlace();
    const [bw,bs,be,bn] = manifest.bounds;
    Object.assign(state,{lat:selectedPlace.lat,lon:selectedPlace.lon,span:selectedPlace.span || 16,name:selectedPlace.name});
    if (hash.has('lat') && lat>bs && lat<bn && lon>bw && lon<be && km>=2 && km<=wholeView().span) {
      Object.assign(state,{lat,lon,span:km,name:hash.get('name') || 'Zonë e zgjedhur',period:hash.get('p') === 'tracker' ? 'tracker' : 'evolution'});
    }
    if (['cumulative','added','compare'].includes(hash.get('m'))) setMode(hash.get('m'),false);
    if (hash.get('b') === '0') state.basemap = false;
    if (TILE_URLS[hash.get('b')]) state.basemapSource = hash.get('b');
    if (BASEMAP_FILTER[hash.get('bm')]) state.basemapMode = hash.get('bm');
    if (hash.has('bt') && Number(hash.get('bt')) >= 0 && Number(hash.get('bt')) <= 95) state.basemapTransp = Number(hash.get('bt'));
    if (hash.get('r') === '0') state.radial = false;
    if (['units','sdg','race','kosovo'].includes(hash.get('t'))) openTab = hash.get('t');
    if (hash.get('u') === '0') state.unitsOverlay = false;
    if (units) {
      for (const id of (hash.get('mun') || hash.get('f') || '').split('.')) if (units.byId.municipalities.has(id)) MUN.add(id);
      for (const id of (hash.get('zk') || '').split('.')) if (units.byId.cadastral.has(id)) ZONE.add(id);
      syncFilter();
    }
    $('toggleUnits').setAttribute('aria-pressed',String(state.unitsOverlay));
    $('toggleRadial').setAttribute('aria-pressed',String(state.radial));
    $('toggleBasemap').setAttribute('aria-pressed',String(state.basemap));
    syncBasemapControls();
    $('period').value = state.period;
    $('search').value = state.name;
    buildLegend();
    paint();
    await loadView();
    if (openTab) document.querySelector(`[data-tab=${openTab}]`)?.click();
  } catch(error) {
    $('status').textContent = 'Të dhënat nuk u ngarkuan. Rifresko faqen për të provuar përsëri.';
    console.error(error);
  }
}
// ---------- Analysis: statistics for the visible area ----------
const events = [{year:1999,label:'1999 · fundi i luftës',anchor:'end'},{year:2008,label:'2008 · pavarësia',anchor:'start'}];
const km2 = value => number(value < 10 ? Math.round(value*100)/100 : Math.round(value*10)/10)+' km²';
// Hectares for the radial diagram, where the values per direction and year are small.
const ha = km => { const v = km*100;return number(v < 10 ? Math.round(v*10)/10 : Math.round(v))+' ha'; };
// ---------- Spatial filter: the selected units, else the radial lens, else the whole view ----------
let filterMask = null;
function filterUnits() {
  if (!units) return [];
  // Per municipality: its picked zones, or the whole municipality when none are picked.
  const zones = selectedUnits();
  return pickedMunicipalities().flatMap(m => { const own = zones.filter(z => z.municipality === m.id);return own.length ? own : [m]; });
}
const filterLabel = list => {
  if (list.length === 1) return unitLabel(list[0]);
  const z = list.filter(u => u.level === 'cadastral').length, m = list.length-z;
  return [m ? `${m} ${C.unit1.many}` : '',z ? `${z} ${C.unit2.many}` : ''].filter(Boolean).join(' + ');
};
function buildFilterMask(v) {
  const size = v.size, c = size/2, list = filterUnits();
  const circle = state.radial ? RADIAL.lens*size : null;
  if (list.length) {
    const draw = document.createElement('canvas');
    draw.width = draw.height = size;
    const ctx = draw.getContext('2d',{willReadFrequently:true});
    const sx = lon => (lon-v.west)/(v.east-v.west)*size, sy = lat => (v.north-lat)/(v.north-v.south)*size;
    ctx.beginPath();
    for (const u of list) for (const poly of u.polys) for (const ring of poly) {
      ctx.moveTo(sx(ring[0]),sy(ring[1]));
      for (let i=2;i<ring.length;i+=2) ctx.lineTo(sx(ring[i]),sy(ring[i+1]));
      ctx.closePath();
    }
    ctx.fillStyle = '#fff';
    ctx.fill('evenodd');
    const alpha = ctx.getImageData(0,0,size,size).data, data = new Uint8Array(size*size);
    let radius = 0;
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const i = y*size+x;
      const d = Math.hypot(x+.5-c,y+.5-c);
      if (alpha[i*4+3] > 127 && (circle == null || d < circle)) { data[i] = 1;radius = Math.max(radius,d); }
    }
    const label = filterLabel(list);
    let inside = 0;
    for (let i=0;i<data.length;i++) inside += data[i];
    return {kind:'units',data,radius:circle ?? Math.max(radius,1),label,list,circle:circle != null,inside};
  }
  if (state.radial) {
    const radius = RADIAL.lens*size, data = new Uint8Array(size*size);
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) data[y*size+x] = Math.hypot(x+.5-c,y+.5-c) < radius ? 1 : 0;
    return {kind:'circle',data,radius,label:'rrethi'};
  }
  return null;
}
function refreshFilter() {
  if (sample && view) viewStats = computeViewStats(sample,view);
  showFilterState();
}
function computeViewStats(grid, v) {
  const n = count(), size = v.size, area = (state.span/size)**2, kmPx = state.span/size, c = size/2;
  const fm = filterMask = buildFilterMask(v);
  const hist = new Float64Array(n+1);
  const half = fm ? fm.radius*kmPx : state.span/2;
  const step = [.25,.5,1,2,5].find(s => half/s <= 10) || 5;
  const rings = half > 20 ? 0 : Math.max(1,Math.ceil(half/step-1e-9));
  const ringLand = new Float64Array(rings), ringHist = Array.from({length:rings},() => new Float64Array(n+1));
  // Radial diagram: four directions × three distance bands inside the lens.
  const lens = fm ? fm.radius+1 : RADIAL.lens*size;
  const radial = Array.from({length:4},() => Array.from({length:3},() => new Float64Array(n+1)));
  for (let y=0;y<size;y++) {
    const dy = (y+.5-c)*kmPx;
    for (let x=0;x<size;x++) {
      const i = y*size+x;
      if (mask[i*4+3] <= 127 || (fm && !fm.data[i])) continue;
      const code = grid[i];
      hist[code]++;
      if (code > 1) {
        const ddx = x+.5-c, ddy = y+.5-c, d = Math.hypot(ddx,ddy);
        if (d < lens) {
          const angle = (Math.atan2(ddx,-ddy)+Math.PI*2.25)%(Math.PI*2);
          radial[Math.floor(angle/(Math.PI/2))][Math.min(2,Math.floor(d/lens*3))][code] += area;
        }
      }
      if (rings) {
        const r = Math.floor(Math.hypot((x+.5-c)*kmPx,dy)/step);
        if (r < rings) { ringLand[r]++; ringHist[r][code]++; }
      }
    }
  }
  const cumulative = [];
  let run = 0;
  for (let k=1;k<=n;k++) { run += hist[k]*area; cumulative.push(run); }
  const added = cumulative.map((value,i) => i ? value-cumulative[i-1] : value);
  const landKm2 = hist.reduce((a,b) => a+b,0)*area;
  return {cumulative,added,step,rings,ringLand,ringHist,radial,lensKm:lens*kmPx,filter:fm,landKm2};
}
function ringShare(r, index) {
  const s = viewStats;
  if (!s.ringLand[r]) return 0;
  let built = 0;
  for (let k=1;k<=index+1;k++) built += s.ringHist[r][k];
  return built/s.ringLand[r]*100;
}
// ---------- Small SVG charts with hover tooltips ----------
function niceMax(value) {
  const power = 10**Math.floor(Math.log10(value || 1));
  return [1,1.5,2,2.5,3,4,5,6,8,10].map(f => f*power).find(v => v >= value*1.02) || 10*power;
}
function esc(text) { return String(text).replace(/[&<>"]/g,ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function timeChart(host, o) {
  const W = Math.max(240,host.clientWidth), H = o.height || 120;
  const m = {l:40,r:8,t:o.events ? 16 : 8,b:20};
  const n = o.values.length, iw = W-m.l-m.r, ih = H-m.t-m.b;
  const max = niceMax(Math.max(...o.values,1e-6));
  const bars = o.kind === 'bars';
  const x = i => m.l+(bars ? (i+.5)*iw/n : n === 1 ? iw/2 : i*iw/(n-1));
  const y = v => m.t+ih-v/max*ih;
  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.label || '')}">`;
  for (const t of [0,max/2,max]) svg += `<line class="${t ? 'grid' : 'axis'}" x1="${m.l}" x2="${W-m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l-6}" y="${y(t)+3}" text-anchor="end">${number(t)}</text>`;
  for (const e of o.events || []) {
    const i = o.years.indexOf(e.year);
    if (i < 0 || i >= n) continue;
    svg += `<g class="event"><line x1="${x(i)}" x2="${x(i)}" y1="${m.t-4}" y2="${m.t+ih}"/><text x="${x(i)+(e.anchor === 'end' ? -3 : 3)}" y="${m.t-6}" text-anchor="${e.anchor || 'start'}">${esc(e.label)}</text></g>`;
  }
  if (bars) {
    const bw = Math.max(1,iw/n-2);
    o.values.forEach((v,i) => {
      const h = Math.max(v > 0 ? 1 : 0,ih-(y(v)-m.t));
      svg += `<rect x="${x(i)-bw/2}" y="${m.t+ih-h}" width="${bw}" height="${h}" rx="${Math.min(2,bw/3)}" fill="${o.colors ? o.colors[i] : 'var(--accent)'}" opacity="${o.active != null && i > o.active ? .28 : 1}"/>`;
    });
  } else {
    const pts = o.values.map((v,i) => x(i)+','+y(v)).join(' ');
    svg += `<polygon points="${m.l},${y(0)} ${pts} ${x(n-1)},${y(0)}" fill="${o.color || 'var(--accent)'}" opacity=".13"/><polyline points="${pts}" fill="none" stroke="${o.color || 'var(--accent)'}" stroke-width="2" stroke-linejoin="round"/>`;
    if (o.active != null) svg += `<circle cx="${x(o.active)}" cy="${y(o.values[o.active])}" r="4.5" fill="${o.color || 'var(--accent)'}" stroke="#090d15" stroke-width="2"/>`;
  }
  if (o.active != null) svg += `<line class="cursor" x1="${x(o.active)}" x2="${x(o.active)}" y1="${m.t}" y2="${m.t+ih}" opacity=".5"/>`;
  const ticks = o.years.map((y,i) => i).filter(i => n > 15 ? o.years[i]%5 === 0 : i%2 === 0 || i === n-1);
  for (const i of ticks) svg += `<text x="${x(i)}" y="${H-5}" text-anchor="middle">${o.years[i]}</text>`;
  svg += `<line class="hover" id="h" x1="0" x2="0" y1="${m.t}" y2="${m.t+ih}" visibility="hidden"/><rect class="hit" x="${m.l}" y="0" width="${iw}" height="${H}"/></svg><div class="chart-tip" hidden></div>`;
  host.innerHTML = svg;
  const hit = host.querySelector('.hit'), tip = host.querySelector('.chart-tip'), hover = host.querySelector('.hover');
  const pick = event => {
    const rect = host.getBoundingClientRect();
    const px = event.clientX-rect.left;
    const i = Math.max(0,Math.min(n-1,Math.round(bars ? (px-m.l)/iw*n-.5 : (px-m.l)/iw*(n-1))));
    return {i,px};
  };
  hit.onpointermove = event => {
    const {i} = pick(event);
    hover.setAttribute('x1',x(i));hover.setAttribute('x2',x(i));hover.setAttribute('visibility','visible');
    tip.hidden = false;
    tip.style.left = Math.max(60,Math.min(W-60,x(i)))+'px';
    tip.style.top = (y(o.values[i])-8)+'px';
    tip.innerHTML = o.tip(i);
  };
  hit.onpointerleave = () => { tip.hidden = true;hover.setAttribute('visibility','hidden'); };
  hit.onclick = event => o.onPick && o.onPick(pick(event).i);
}
function ringChart(host) {
  const s = viewStats;
  if (!s || !s.rings) { host.innerHTML = '<p class="note">Profili sipas largësisë shfaqet kur pamja është më e vogël se 40 km.</p>';return; }
  const W = Math.max(240,host.clientWidth), H = 130, m = {l:34,r:6,t:8,b:20};
  const iw = W-m.l-m.r, ih = H-m.t-m.b, n = s.rings, palette = colors();
  const base = Array.from({length:n},(_,r) => ringShare(r,0));
  const now = Array.from({length:n},(_,r) => ringShare(r,state.index));
  const max = niceMax(Math.max(...now,...base,1));
  const y = v => m.t+ih-v/max*ih, band = iw/n, bw = Math.max(2,(band-6)/2);
  const nowColor = 'rgb('+palette[state.index].join(',')+')';
  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="Përqindja e tokës së ndërtuar sipas largësisë">`;
  for (const t of [0,max/2,max]) svg += `<line class="${t ? 'grid' : 'axis'}" x1="${m.l}" x2="${W-m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l-5}" y="${y(t)+3}" text-anchor="end">${number(t)}%</text>`;
  for (let r=0;r<n;r++) {
    const x0 = m.l+r*band+2;
    svg += `<rect x="${x0}" y="${y(base[r])}" width="${bw}" height="${m.t+ih-y(base[r])}" rx="1.5" fill="rgb(${palette[0].join(',')})"/>`;
    if (state.index) svg += `<rect x="${x0+bw+2}" y="${y(now[r])}" width="${bw}" height="${m.t+ih-y(now[r])}" rx="1.5" fill="${nowColor}"/>`;
    svg += `<text x="${x0+band/2-2}" y="${H-5}" text-anchor="middle">${band < 48 ? number((r+1)*s.step) : number(r*s.step)+'–'+number((r+1)*s.step)}</text>`;
    svg += `<rect class="hit" data-r="${r}" x="${m.l+r*band}" y="0" width="${band}" height="${H}"/>`;
  }
  svg += `</svg><div class="chart-tip" hidden></div><div class="legend-row"><span><i style="background:rgb(${palette[0].join(',')})"></i>${yearLabel(0)}</span>${state.index ? `<span><i style="background:${nowColor}"></i>${yearLabel(state.index)}</span>` : ''}<span>${band < 48 ? 'kufiri i jashtëm i unazës, km' : 'km nga qendra'}</span></div>`;
  let gain = -1, gainRing = 0;
  for (let r=0;r<n;r++) { const g = (now[r]-base[r])*s.ringLand[r]; if (g > gain) { gain = g;gainRing = r; } }
  if (state.index && gain > 0) svg += `<p class="note">Shtesa më e madhe në sipërfaqe ndodhi në unazën <b>${number(gainRing*s.step)}–${number((gainRing+1)*s.step)} km</b> nga qendra.</p>`;
  host.innerHTML = svg;
  const tip = host.querySelector('.chart-tip');
  host.querySelectorAll('.hit').forEach(el => {
    el.onpointermove = () => {
      const r = Number(el.dataset.r);
      tip.hidden = false;
      tip.style.left = Math.max(70,Math.min(W-70,m.l+(r+.5)*band))+'px';
      tip.style.top = (y(Math.max(base[r],now[r]))-8)+'px';
      tip.innerHTML = `${number(r*s.step)}–${number((r+1)*s.step)} km<br>${yearLabel(0)}: <b>${number(base[r])}%</b>`+(state.index ? `<br>${yearLabel(state.index)}: <b>${number(now[r])}%</b>` : '');
    };
    el.onpointerleave = () => { tip.hidden = true; };
  });
}
function renderZone() {
  const s = viewStats;
  if (!s) { $('zoneStory').textContent = 'Duke llogaritur…';return; }
  const c = s.cumulative, n = c.length, palette = colors();
  const start = c[0], end = c[n-1], growth = end-start;
  let peak = 1;
  for (let i=2;i<n;i++) if (s.added[i] > s.added[peak]) peak = i;
  const ratio = start > 0 ? end/start : null;
  const scope = !s.filter ? `Në këtë pamje (${esc(state.name)})` : s.filter.kind === 'circle' ? `Brenda rrethit me rreze ${number(Math.round(s.lensKm*10)/10)} km rreth ${esc(state.name)}` : s.filter.circle ? `Brenda rrethit me rreze ${number(Math.round(s.lensKm*10)/10)} km, vetëm në ${esc(s.filter.label)}` : `Brenda filtrit (${esc(s.filter.label)})`;
  let story = `${scope}, zona e ndërtuar kalon nga <b>${km2(start)}</b> (${yearLabel(0)}) në <b>${km2(end)}</b> (${yearLabel(n-1)})`;
  story += ratio && ratio >= 1.5 ? `, rreth <b>${number(Math.round(ratio*10)/10)} herë</b> më shumë.` : ratio ? `, <b>+${number(Math.round((ratio-1)*1000)/10)}%</b>.` : '.';
  if (state.period === 'evolution' && growth > 0) {
    const after = (end-c[stepIndexOfYear(1999)])/growth*100;
    story += ` <b>${number(Math.round(after))}%</b> e kësaj rritjeje u regjistrua pas vitit 1999.`;
  }
  if (/^Korrik/.test(yearLabel(0))) story += ` Shtesa e hapit të parë (${yearLabel(1)}) mbulon vetëm gjashtë muaj.`;
  $('zoneStory').innerHTML = story;
  $('kpiGrowth').textContent = ratio ? '+'+number(Math.round((ratio-1)*100))+'%' : '—';
  $('kpiPeak').textContent = growth > 0 ? yearLabel(peak).replace(/^Janar /,'') : '—';
  $('kpiPeak').title = growth > 0 ? '+'+km2(s.added[peak]) : '';
  $('kpiAvg').textContent = number(Math.round(growth/(n-1)*100)/100)+' km²';
  const pickYear = i => setIndex(i);
  timeChart($('chartCumulative'),{values:c,years:period().steps.map(s => s.year),active:state.index,events:state.period === 'evolution' ? events : null,
    label:'Zona e ndërtuar kumulative',onPick:pickYear,tip:i => `${yearLabel(i)}<br><b>${km2(c[i])}</b>`});
  const added = s.added.map((v,i) => i ? v : 0);
  timeChart($('chartAdded'),{kind:'bars',values:added,years:period().steps.map(s => s.year),active:state.index,colors:palette.map(p => 'rgb('+p.join(',')+')'),
    label:'Shtesa sipas vitit',onPick:pickYear,tip:i => i ? `${yearLabel(i)}<br><b>+${km2(added[i])}</b>` : `${yearLabel(0)}<br>Gjendja fillestare`});
  ringChart($('chartRings'));
  renderZoneStatistics();
}
// ---------- Municipal race ----------
let raceKey = '';
function renderRace(rebuild) {
  if (!stats) return;
  const host = $('race'), period = state.period, idx = state.index, sort = $('raceSort').value, rowH = 26;
  if (rebuild || raceKey !== period) {
    raceKey = period;
    host.replaceChildren();
    for (const m of stats.municipal) {
      const row = document.createElement('button');
      row.className = 'race-row';row.dataset.id = m.id;row.setAttribute('role','listitem');
      row.innerHTML = `<span class="race-name">${esc(m.name)}</span><span><span class="race-bar"></span></span><span class="race-value"></span>`;
      row.onclick = () => { const place = places.find(p => p.id === m.id);if (place) selectPlace(place); };
      host.append(row);
    }
    host.style.height = stats.municipal.length*rowH+'px';
  }
  const metric = (s,i) => sort === 'area' ? s[i] : sort === 'pct' ? (i ? (s[i]/s[0]-1)*100 : 0) : (i ? s[i]-s[i-1] : 0);
  let max = 0;
  for (const m of stats.municipal) for (let i=0;i<count();i++) max = Math.max(max,metric(m[period],i));
  const rows = stats.municipal.map(m => ({m,value:metric(m[period],idx)})).sort((a,b) => b.value-a.value);
  const color = 'rgb('+colors()[idx].join(',')+')';
  rows.forEach(({m,value},rank) => {
    const row = host.querySelector(`[data-id="${m.id}"]`);
    row.style.transform = `translateY(${rank*rowH}px)`;
    row.classList.toggle('selected',selectedPlace?.id === m.id && state.name === selectedPlace.name);
    const bar = row.querySelector('.race-bar');
    bar.style.width = (max ? Math.max(0,value)/max*100 : 0)+'%';
    bar.style.setProperty('--color',color);
    row.querySelector('.race-value').textContent = sort === 'pct' ? (idx ? '+'+number(Math.round(value))+'%' : '—') : (sort === 'added' && idx ? '+' : '')+number(Math.round(value*100)/100);
    row.title = `${m.name} · ${yearLabel(idx)} · ${km2(m[period][idx])} brenda 5 km`;
  });
}
// ---------- Kosovo-wide view and fastest-growing settlements ----------
function renderKosovo() {
  if (!stats) { $('kosovoStory').textContent = 'Statistikat nuk u ngarkuan.';return; }
  const e = stats.national.evolution, t = stats.national.tracker;
  const share = (e[e.length-1]-e[stepIndexOfYear(1999,'evolution')])/(e[e.length-1]-e[0])*100;
  const pe = period('evolution'), pt = period('tracker');
  $('kosovoStory').innerHTML = `Sipas WSF Evolution, zona e ndërtuar ${C.in} u rrit nga <b>${km2(e[0])}</b> në ${pe.steps[0].label} në <b>${km2(e[e.length-1])}</b> në ${pe.steps.at(-1).label}, <b>${number(Math.round(e[e.length-1]/e[0]*10)/10)} herë</b> më shumë. Rreth <b>${number(Math.round(share))}%</b> e kësaj rritjeje erdhi pas vitit 1999. Tracker, me rezolucion më të imët, regjistron <b>+${number(Math.round((t[t.length-1]/t[0]-1)*100))}%</b> nga ${pt.steps[0].label.toLowerCase()} deri në ${pt.steps.at(-1).label.toLowerCase()}.`;
  const go = (period,i) => {
    if (state.period !== period) { $('period').value = period;$('period').onchange(); }
    setIndex(i);
  };
  timeChart($('chartNationEvo'),{values:e,years:pe.steps.map(s => s.year),events,active:state.period === 'evolution' ? state.index : null,color:'#5e9bff',
    label:C.name+' '+pe.range,onPick:i => go('evolution',i),tip:i => `${yearLabel(i,'evolution')}<br><b>${km2(e[i])}</b>`+(i ? `<br>+${km2(e[i]-e[i-1])}` : '')});
  timeChart($('chartNationTrk'),{values:t,years:pt.steps.map(s => s.year),active:state.period === 'tracker' ? state.index : null,color:'#5e9bff',
    label:C.name+' '+pt.range,onPick:i => go('tracker',i),tip:i => `${yearLabel(i,'tracker')}<br><b>${km2(t[i])}</b>`+(i ? `<br>+${km2(t[i]-t[i-1])}` : '')});
  const [a,b] = state.period === 'evolution' ? [0,1] : [2,3];
  $('hotTitle').innerHTML = `Vendbanimet me shtesën më të madhe <small>${period().range} · brenda 1 km nga pika e vendbanimit</small>`;
  const ranked = places.map(p => ({p,v:stats.places[p.id]})).filter(r => r.v).sort((x,y) => (y.v[b]-y.v[a])-(x.v[b]-x.v[a]));
  const chosen = [];
  for (const r of ranked) {
    if (chosen.some(c => Math.hypot((c.p.lat-r.p.lat)*111,(c.p.lon-r.p.lon)*82) < 1.6)) continue;
    chosen.push(r);
    if (chosen.length === 12) break;
  }
  $('hotspots').replaceChildren(...chosen.map((r,k) => {
    const li = document.createElement('li'), button = document.createElement('button');
    const ratio = r.v[a] > 0 ? ' · ×'+number(Math.round(r.v[b]/r.v[a]*10)/10) : '';
    button.innerHTML = `<span class="rank">${k+1}</span><span>${esc(r.p.name)}<small>${number(r.v[a])} → ${number(r.v[b])} ha${ratio}</small></span><span class="val">+${number(Math.round(r.v[b]-r.v[a]))} ha</span>`;
    button.onclick = () => selectPlace({...r.p,span:r.p.span || 4});
    li.append(button);
    return li;
  }));
}
function updateAnalytics() {
  if (state.tab === 'zone') renderZone();
  else if (state.tab === 'units') renderUnits();
  else if (state.tab === 'sdg') renderSdg();
  else if (state.tab === 'race') renderRace();
  else renderKosovo();
}
// ---------- Map modes, comparison slider and hover tooltip ----------
function setMode(mode, repaint=true) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active',b.dataset.mode === mode);b.setAttribute('aria-checked',String(b.dataset.mode === mode)); });
  $('compare').hidden = mode !== 'compare';
  if (mode === 'compare' && state.index === state.compareIndex) { state.index = count()-1; }
  if (repaint) { paint();if (sample) updateHash(); }
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('compareYear').onchange = () => { state.compareIndex = Number($('compareYear').value);paint(); };
let splitDrag = false;
$('divider').onpointerdown = event => { splitDrag = true;$('divider').setPointerCapture(event.pointerId);event.stopPropagation(); };
$('divider').onpointermove = event => {
  if (!splitDrag) return;
  const rect = canvas.getBoundingClientRect();
  state.split = Math.max(.02,Math.min(.98,(event.clientX-rect.left)/rect.width));
  paint();
};
$('divider').onpointerup = $('divider').onpointercancel = () => { splitDrag = false; };
$('divider').onkeydown = event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();event.stopPropagation();
  state.split = Math.max(.02,Math.min(.98,state.split+(event.key === 'ArrowLeft' ? -.03 : .03)));
  paint();
};
canvas.addEventListener('pointermove',event => {
  if (drag || !sample || event.pointerType === 'touch') { $('tip').hidden = true;return; }
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX-rect.left)*canvas.width/rect.width-view.x);
  const y = Math.floor((event.clientY-rect.top)*canvas.height/rect.height-view.y);
  if (x < 0 || y < 0 || x >= view.size || y >= view.size || mask[(y*view.size+x)*4+3] <= 127) { $('tip').hidden = true;return; }
  const code = sample[y*view.size+x];
  const km = Math.hypot(x+.5-view.size/2,y+.5-view.size/2)*state.span/view.size;
  const palette = colors();
  let text;
  if (!code) text = 'Pa ndërtim të identifikuar';
  else if (code === 1) text = `<i style="background:rgb(${palette[0].join(',')})"></i>Ndërtuar deri në <b>${yearLabel(0).toLowerCase()}</b>`;
  else text = `<i style="background:rgb(${palette[code-1].join(',')})"></i>Identifikuar në <b>${yearLabel(code-1)}</b>`;
  let where = '';
  if (units) {
    const lon = view.west+(x+.5)/view.size*(view.east-view.west), lat = view.north-(y+.5)/view.size*(view.north-view.south);
    const m = unitAt(lon,lat,'municipalities'), c = unitAt(lon,lat,'cadastral');
    if (m) where = `<small>${esc(C.unit1.One)}: <b>${esc(m.name)}</b>${c ? ` · ${esc(C.unit2.short)}: <b>${esc(c.name)}</b>` : ''}${state.unitsOverlay ? (MUN.has(m.id) ? (c ? ` · kliko: ${ZONE.has(c.id) ? 'hiqe' : 'zgjidhe'} njësinë` : '') : ` · kliko: shto ${esc(C.unit1.acc)} në filtër`) : ''}</small>`;
  }
  $('tip').innerHTML = text+where+`<small>${number(Math.round(km*10)/10)} km nga qendra e pamjes</small>`;
  const wrap = $('tip').parentElement.getBoundingClientRect();
  $('tip').style.left = Math.min(event.clientX-wrap.left+14,wrap.width-200)+'px';
  $('tip').style.top = (event.clientY-wrap.top+14)+'px';
  $('tip').hidden = false;
});
canvas.addEventListener('pointerleave',() => { $('tip').hidden = true; });
// ---------- Tabs, sorting and keyboard ----------
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
  state.tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(t => t.setAttribute('aria-selected',String(t === b)));
  for (const name of ['zone','units','sdg','race','kosovo']) $('tab-'+name).hidden = name !== state.tab;
  document.querySelector('main').classList.toggle('wide-insights',state.tab === 'units' || state.tab === 'sdg');
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(loadView,60);
  updateAnalytics();
});
$('raceSort').onchange = () => renderRace();
document.addEventListener('keydown',event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target.tagName;
  if ((tag === 'INPUT' && event.target.type !== 'range') || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (event.target.id === 'time' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
  if (event.key === 'ArrowRight' && state.index < count()-1) { event.preventDefault();setIndex(state.index+1); }
  else if (event.key === 'ArrowLeft' && state.index > 0) { event.preventDefault();setIndex(state.index-1); }
  else if (event.key === ' ' && tag !== 'BUTTON') { event.preventDefault();$('play').click(); }
});
// ---------- Radial diagram around a lens (inspired by radial small-multiple maps) ----------
// Inside the lens: the map. Around it: one chart per direction (N, E, S, W).
// Time runs clockwise along each arc; height = area added that year inside the lens
// in that quarter, stacked from near the centre (inside) to the lens edge (outside).
const DIRS = ['VERI','LINDJE','JUG','PERËNDIM'];
// Shades of a year's colour for the three distance bands: darker near the centre, lighter at the edge.
const shade = (rgb,band) => {
  const mix = band === 0 ? rgb.map(v => Math.round(v*.55)) : band === 2 ? rgb.map(v => Math.round(v+(255-v)*.5)) : rgb;
  return 'rgb('+mix.join(',')+')';
};
const BAND_NAMES = ['afër qendrës','në mes','në skaj'];
function renderRadial() {
  const svg = $('radial');
  $('radialKey').hidden = !state.radial;
  if (!state.radial || !view) { svg.innerHTML = '';return; }
  const scale = canvas.clientWidth/canvas.width;
  const W = canvas.clientWidth, H = canvas.clientHeight, S = view.size*scale;
  const cx = (view.x+view.size/2)*scale, cy = (view.y+view.size/2)*scale;
  const lens = RADIAL.lens*S, r0 = RADIAL.inner*S, h = (RADIAL.outer-RADIAL.inner)*S, half = RADIAL.span/2;
  const pt = (deg,r) => [cx+r*Math.sin(deg*Math.PI/180),cy-r*Math.cos(deg*Math.PI/180)];
  const f = p => p[0].toFixed(1)+' '+p[1].toFixed(1);
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const s = viewStats, byUnits = s?.filter?.kind === 'units';
  // No dimming outside: the map itself shows only base-year areas there, in their normal colour.
  let out = `<circle class="radial-lens" cx="${cx}" cy="${cy}" r="${lens}"/>`;
  $('radialKeyText').innerHTML = byUnits ? `Shtesat vjetore brenda rrethit (rrezja <output id="lensKm">${number(Math.round(RADIAL.lens*state.span*10)/10)} km</output>) dhe brenda <span class="kname">${esc(s.filter.label)}</span>, sipas drejtimit.` : `Shtesat vjetore brenda rrethit (rrezja <output id="lensKm">${number(Math.round(RADIAL.lens*state.span*10)/10)} km</output>), sipas drejtimit.`;
  if (s && s.radial) {
    const m = count()-1;
    const series = s.radial.map(dir => dir.map(band => Array.from({length:m},(_,k) => band[k+2])));
    let max = 0;
    series.forEach(dir => { for (let k=0;k<m;k++) max = Math.max(max,dir[0][k]+dir[1][k]+dir[2][k]); });
    max = max || 1;
    const ang = (d,k) => d*90-half+(m === 1 ? .5 : k/(m-1))*RADIAL.span;
    series.forEach((dir,d) => {
      out += `<path class="radial-base" d="M${f(pt(ang(d,0),r0))}A${r0} ${r0} 0 0 1 ${f(pt(ang(d,m-1),r0))}"/>`;
      // One bar per year, coloured like the map. Within a bar, shades split the
      // area by distance from the centre: dark = near the centre, light = near the edge.
      const now = state.index-1, palette = colors();
      const step = m > 1 ? RADIAL.span/(m-1) : RADIAL.span, width = step*.78;
      const sector = (a0,a1,ra,rb) => `M${f(pt(a0,ra))}L${f(pt(a0,rb))}A${rb} ${rb} 0 0 1 ${f(pt(a1,rb))}L${f(pt(a1,ra))}A${ra} ${ra} 0 0 0 ${f(pt(a0,ra))}Z`;
      for (let k=0;k<m;k++) {
        const color = palette[k+1], opacity = now >= 0 && k > now ? .25 : 1;
        const a = ang(d,k);
        let base = 0;
        for (let b=0;b<3;b++) {
          const v = dir[b][k];
          if (v <= 0) continue;
          const ra = r0+base/max*h, rb = r0+(base+v)/max*h;
          out += `<path d="${sector(a-width/2,a+width/2,ra,Math.max(rb,ra+.6))}" fill="${shade(color,b)}" opacity="${opacity}"/>`;
          base += v;
        }
      }
      if (now >= 0) {
        const total = dir[0][now]+dir[1][now]+dir[2][now];
        const a = ang(d,now), top = r0+total/max*h+10;
        out += `<line class="radial-now" x1="${pt(a,lens)[0]}" y1="${pt(a,lens)[1]}" x2="${pt(a,top)[0]}" y2="${pt(a,top)[1]}"/><circle cx="${pt(a,top)[0]}" cy="${pt(a,top)[1]}" r="2.5" fill="#fff"/>`;
      }
      for (const k of [0,m-1]) {
        const [tx,ty] = pt(ang(d,k),(lens+r0)/2);
        out += `<text class="radial-year" x="${tx}" y="${ty+3}" text-anchor="middle">${period().steps[k+1].short}</text>`;
      }
      const total = dir.reduce((sum,band) => sum+band.reduce((a,b) => a+b,0),0);
      const flip = d === 2, R = RADIAL.outer*S+(flip ? 16 : 7);
      const [la,lb] = flip ? [ang(d,m-1)+4,ang(d,0)-4] : [ang(d,0)-4,ang(d,m-1)+4];
      out += `<path id="radialArc${d}" d="M${f(pt(la,R))}A${R} ${R} 0 0 ${flip ? 0 : 1} ${f(pt(lb,R))}" fill="none"/><text class="radial-label"><textPath href="#radialArc${d}" startOffset="50%" text-anchor="middle">${DIRS[d]} · +${ha(total)}</textPath></text>`;
      const Ro = RADIAL.outer*S+4, a0 = ang(d,0)-2, a1 = ang(d,m-1)+2;
      out += `<path class="radial-hit" data-d="${d}" d="M${f(pt(a0,r0-4))}L${f(pt(a0,Ro))}A${Ro} ${Ro} 0 0 1 ${f(pt(a1,Ro))}L${f(pt(a1,r0-4))}A${r0-4} ${r0-4} 0 0 0 ${f(pt(a0,r0-4))}Z"/>`;
    });
    svg.innerHTML = out;
    const yearAt = (event,d) => {
      const rect = svg.getBoundingClientRect();
      let a = Math.atan2(event.clientX-rect.left-cx,-(event.clientY-rect.top-cy))*180/Math.PI;
      a = ((a-(d*90-half))%360+540)%360-180;
      return Math.max(0,Math.min(m-1,Math.round(a/RADIAL.span*(m-1))));
    };
    svg.querySelectorAll('.radial-hit').forEach(el => {
      const d = Number(el.dataset.d);
      el.onpointermove = event => {
        const k = yearAt(event,d), v = series[d].map(band => band[k]);
        const wrap = $('tip').parentElement.getBoundingClientRect();
        $('tip').innerHTML = `<b>${DIRS[d]} · ${yearLabel(k+1)}</b><br>`+v.map((x,b) => `<i style="background:${shade(colors()[k+1],b)}"></i>${BAND_NAMES[b]}: +${ha(x)}`).join('<br>')+`<small>Kliko për të zgjedhur vitin</small>`;
        $('tip').style.left = Math.min(event.clientX-wrap.left+14,wrap.width-210)+'px';
        $('tip').style.top = (event.clientY-wrap.top+14)+'px';
        $('tip').hidden = false;
      };
      el.onpointerleave = () => { $('tip').hidden = true; };
      el.onclick = event => setIndex(yearAt(event,d)+1);
    });
  } else svg.innerHTML = out;
}
$('radial').addEventListener('wheel',event => { event.preventDefault();canvas.dispatchEvent(new WheelEvent('wheel',event)); },{passive:false});
function setLayer(name,on) {
  state[name] = on;
  const button = $({radial:'toggleRadial',basemap:'toggleBasemap',unitsOverlay:'toggleUnits'}[name]);
  button.setAttribute('aria-pressed',String(on));
  syncBasemapControls();
  if (name === 'radial') refreshFilter();
  if (view) { paint(name !== 'radial');if (sample) updateHash(); }
}
$('toggleRadial').onclick = () => setLayer('radial',!state.radial);
$('toggleBasemap').onclick = () => setLayer('basemap',!state.basemap);
// ---------- Base-map controls in the side panel ----------
function syncBasemapControls() {
  $('bmSource').value = state.basemap ? state.basemapSource : 'none';
  $('bmMode').value = state.basemapMode;
  $('bmMode').disabled = $('bmTransp').disabled = !state.basemap;
  $('bmTransp').value = state.basemapTransp;
  $('bmTranspValue').textContent = state.basemapTransp+'%';
  $('osmCredit').hidden = !state.basemap;
  $('osmCredit').innerHTML = BASEMAP_CREDIT[state.basemapSource].html;
  $('toggleBasemap').setAttribute('aria-pressed',String(state.basemap));
}
$('bmSource').onchange = () => {
  const v = $('bmSource').value;
  if (v !== 'none') state.basemapSource = v;
  // Satellite imagery reads best in natural colours; switch to RGB when it is chosen from the dark style.
  if (v === 'esri' && state.basemapMode === 'dark') state.basemapMode = 'rgb';
  setLayer('basemap',v !== 'none');
};
$('bmMode').onchange = () => { state.basemapMode = $('bmMode').value;setLayer('basemap',true); };
$('bmTransp').oninput = () => { state.basemapTransp = Number($('bmTransp').value);syncBasemapControls();if (view) paint(true); };
$('bmTransp').onchange = () => { if (sample) updateHash(); };
$('copyCite').onclick = async () => {
  try { await navigator.clipboard.writeText($('citeText').textContent);$('copyCite').textContent = 'U kopjua ✓'; }
  catch { $('copyCite').textContent = 'Zgjidhe tekstin për ta kopjuar'; }
  setTimeout(() => { $('copyCite').textContent = 'Kopjo'; },2500);
};
console.log('%c ATLASI URBAN · KOSOVË %c\nKoncepti, analiza dhe zhvillimi: Rizah Murseli\nTë dhënat: DLR World Settlement Footprint · GeoNames · OpenStreetMap',
  'background:#66e0d1;color:#08221e;font-weight:700;padding:3px 6px;border-radius:3px','color:#94a6bd');

// ---------- Administrative units: municipalities and cadastral zones ----------
let units = null;
const unitSel = {municipalities:new Set(),cadastral:new Set()};
const UNIT_COLORS = ['#3987e5','#d95926','#199e70','#c98500','#d55181','#0ca30c','#9085e9','#e66767'];
// Sequential yellow → red: low values yellow, high values red.
const CHORO = ['#ffe48a','#fdb24c','#f57d34','#dc4127','#a81d22'];
Object.assign(state,{unitLevel:'municipalities',unitMetric:'share',unitsOverlay:true,unitQuery:'',unitSort:{key:'metric',dir:-1}});
const METRICS = {
  share:{label:'Pjesa e territorit të ndërtuar',note:'Sa përqind e sipërfaqes së njësisë është e ndërtuar. E krahasueshme mes njësive të madhësive të ndryshme.',fmt:v => number(Math.round(v*10)/10)+'%'},
  built:{label:'Sipërfaqja e ndërtuar',note:'Sipërfaqja totale e ndërtuar brenda njësisë.',fmt:v => areaFmt(v)},
  growth:{label:'Rritja nga gjendja fillestare',note:'Sa u rrit zona e ndërtuar krahasuar me hapin e parë të periudhës. Njësitë pa ndërtim fillestar nuk kanë vlerë.',fmt:v => v == null ? '—' : (v >= 0 ? '+' : '')+number(Math.round(v))+'%'},
  added:{label:'Shtesa nga gjendja fillestare',note:'Sipërfaqja e ndërtuar e shtuar që nga hapi i parë i periudhës.',fmt:v => '+'+areaFmt(v)},
  intensity:{label:'Shtesa për km² territor',note:'Hektarë të rinj ndërtimi për çdo km² të njësisë: tregon presionin e zgjerimit pavarësisht madhësisë.',fmt:v => number(Math.round(v*10)/10)+' ha/km²'},
};
const areaFmt = v => v < 1 ? number(Math.round(v*100*10)/10)+' ha' : km2(v);
function decodeUnits(raw) {
  const q = raw.quant;
  for (const level of ['municipalities','cadastral']) for (const u of raw[level]) {
    u.level = level;
    u.polys = u.rings.map(poly => poly.map(enc => {
      const out = new Float64Array(enc.length);
      let x = 0, y = 0;
      for (let i=0;i<enc.length;i+=2) { x += enc[i];y += enc[i+1];out[i] = x/q;out[i+1] = y/q; }
      return out;
    }));
    delete u.rings;
  }
  raw.byId = {municipalities:new Map(raw.municipalities.map(u => [u.id,u])),cadastral:new Map(raw.cadastral.map(u => [u.id,u]))};
  const all = raw.municipalities;
  raw.kosovo = {name:C.name,level:'total',areaKm2:all.reduce((a,u) => a+u.areaKm2,0)};
  for (const p of Object.keys(manifest.periods)) raw.kosovo[p] = all[0][p].map((_,i) => all.reduce((a,u) => a+u[p][i],0));
  return raw;
}
const munName = id => units.byId.municipalities.get(id)?.name || '';
const unitLabel = u => u.level === 'cadastral' ? `${u.name} · ${munName(u.municipality)}` : u.name;
function metricOf(u,i=state.index,key=state.unitMetric,p=state.period) {
  const s = u[p], built = s[i], base = s[0];
  if (key === 'share') return built/u.areaKm2*100;
  if (key === 'built') return built;
  if (key === 'growth') return base > 0.0005 ? (built/base-1)*100 : null;
  if (key === 'added') return built-base;
  return (built-base)*100/u.areaKm2;
}
function aggregate(list,name) {
  const out = {name,level:'total',areaKm2:list.reduce((a,u) => a+u.areaKm2,0)};
  for (const p of Object.keys(manifest.periods)) out[p] = list[0][p].map((_,i) => list.reduce((a,u) => a+u[p][i],0));
  return out;
}
// One filter state, shown the same way everywhere: any number of municipalities, then
// (optionally) zones inside them. The analysis covers the zones if any are picked,
// otherwise the whole of the chosen municipalities, otherwise all of Kosovo.
const MUN = unitSel.municipalities, ZONE = unitSel.cadastral;
function syncFilter() {
  for (const id of [...ZONE]) if (!MUN.has(units.byId.cadastral.get(id)?.municipality)) ZONE.delete(id);
  state.unitLevel = MUN.size && units.cadastral.length ? 'cadastral' : 'municipalities';
}
const pickedMunicipalities = () => [...MUN].map(id => units.byId.municipalities.get(id)).filter(Boolean);
const levelUnits = () => units[state.unitLevel];
const filteredUnits = () => state.unitLevel === 'cadastral' ? units.cadastral.filter(u => MUN.has(u.municipality)) : units.municipalities;
const selectedUnits = () => state.unitLevel === 'cadastral' ? [...ZONE].map(id => units.byId.cadastral.get(id)).filter(Boolean) : [];
function inUnit(u,lon,lat) {
  const [w,s,e,n] = u.bbox;
  if (lon < w || lon > e || lat < s || lat > n) return false;
  let inside = false;
  for (const poly of u.polys) for (const ring of poly) {
    for (let i=0,j=ring.length-2;i<ring.length;j=i,i+=2) {
      const xi = ring[i], yi = ring[i+1], xj = ring[j], yj = ring[j+1];
      if ((yi > lat) !== (yj > lat) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi) inside = !inside;
    }
  }
  return inside;
}
const unitAt = (lon,lat,level=state.unitLevel) => units && units[level].find(u => inUnit(u,lon,lat));
function toggleUnit(u) {
  if (u.level === 'municipalities') MUN.has(u.id) ? MUN.delete(u.id) : MUN.add(u.id);
  else if (!MUN.has(u.municipality)) MUN.add(u.municipality);   // a zone of an unselected municipality adds the municipality first
  else ZONE.has(u.id) ? ZONE.delete(u.id) : ZONE.add(u.id);
  afterSelection();
}
// Map and thematic-map clicks: outside the chosen municipalities a click adds the municipality,
// inside them it picks or drops the cadastral zone.
function clickUnitAt(lon,lat) {
  const m = unitAt(lon,lat,'municipalities');
  if (!m) return;
  if (!MUN.has(m.id)) return toggleUnit(m);
  const z = unitAt(lon,lat,'cadastral');
  if (z) toggleUnit(z);
}
function clearFilter() { MUN.clear();ZONE.clear();afterSelection(); }
function afterSelection(zoom=true) {
  syncFilter();
  // The map (and so the radial diagram) is centred on the filter: the chosen zones or municipality.
  const list = filterUnits();
  if (zoom && list.length) { zoomToUnits(list,list.length === 1 ? list[0].name : filterLabel(list));return; }
  refreshFilter();
  paint(true);
  if (state.tab === 'units') renderUnits();
  if (state.tab === 'sdg') renderSdg();
  if (sample) updateHash();
}
// Outlines on the main map, selected units filled.
function drawUnits() {
  if (!units || !state.unitsOverlay || !view) return;
  const sx = lon => view.x+(lon-view.west)/(view.east-view.west)*view.size;
  const sy = lat => view.y+(view.north-lat)/(view.north-view.south)*view.size;
  const trace = u => {
    for (const poly of u.polys) for (const ring of poly) {
      context.moveTo(sx(ring[0]),sy(ring[1]));
      for (let i=2;i<ring.length;i+=2) context.lineTo(sx(ring[i]),sy(ring[i+1]));
      context.closePath();
    }
  };
  const visible = u => !(u.bbox[2] < view.west || u.bbox[0] > view.east || u.bbox[3] < view.south || u.bbox[1] > view.north);
  const scale = canvas.width/canvas.clientWidth;
  context.save();
  context.beginPath();
  context.rect(view.x,view.y,view.size,view.size);
  context.clip();
  context.lineJoin = 'round';
  const only = MUN.size ? pickedMunicipalities() : null;
  if (state.unitLevel === 'cadastral') {
    context.beginPath();
    for (const u of units.cadastral) if (visible(u) && (!only || MUN.has(u.municipality))) trace(u);
    context.strokeStyle = state.span > 40 ? 'rgba(200,211,224,.16)' : 'rgba(200,211,224,.32)';
    context.lineWidth = .7*scale;
    context.stroke();
  }
  context.beginPath();
  for (const u of only || units.municipalities) if (visible(u)) trace(u);
  context.strokeStyle = only ? 'rgba(232,238,246,.9)' : 'rgba(232,238,246,.55)';
  context.lineWidth = (state.unitLevel === 'cadastral' ? 1.4 : 1.1)*scale;
  context.stroke();
  const chosen = filterUnits().filter(visible);
  if (chosen.length) {
    context.beginPath();
    for (const u of chosen) trace(u);
    context.fillStyle = 'rgba(102,224,209,.14)';
    context.fill('evenodd');
    context.strokeStyle = '#66e0d1';
    context.lineWidth = 2.2*scale;
    context.stroke();
  }
  context.restore();
}
// ---------- Units panel ----------
const choroCache = {};
function choroSvg(level) {
  if (choroCache[level]) return choroCache[level];
  const [w,s,e,n] = manifest.bounds, k = Math.cos(42.6*Math.PI/180);
  const all = units.municipalities.map(u => u.bbox);
  const W0 = Math.min(...all.map(b => b[0])), E0 = Math.max(...all.map(b => b[2])), S0 = Math.min(...all.map(b => b[1])), N0 = Math.max(...all.map(b => b[3]));
  const width = 500, scale = width/((E0-W0)*k), height = Math.round((N0-S0)*scale);
  const d = u => u.polys.map(poly => poly.map(ring => {
    let out = '';
    for (let i=0;i<ring.length;i+=2) out += (i ? 'L' : 'M')+((ring[i]-W0)*k*scale).toFixed(1)+' '+((N0-ring[i+1])*scale).toFixed(1);
    return out+'Z';
  }).join('')).join('');
  choroCache.project = (lon,lat) => [(lon-W0)*k*scale,(N0-lat)*scale];
  choroCache.full = [0,0,width,height];
  // Label point: area-weighted centroid of each municipality's largest ring.
  const labelAt = u => {
    let best = null, bestArea = 0;
    for (const poly of u.polys) {
      const r = poly[0];
      let a = 0, cx = 0, cy = 0;
      for (let i=0,j=r.length-2;i<r.length;j=i,i+=2) {
        const [x0,y0] = choroCache.project(r[j],r[j+1]), [x1,y1] = choroCache.project(r[i],r[i+1]), f = x0*y1-x1*y0;
        a += f;cx += (x0+x1)*f;cy += (y0+y1)*f;
      }
      if (Math.abs(a) > bestArea) { bestArea = Math.abs(a);best = [cx/(3*a),cy/(3*a)]; }
    }
    return best;
  };
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Harta tematike e njësive">`;
  for (const u of units[level]) svg += `<path class="u" data-id="${u.id}" fill-rule="evenodd" d="${d(u)}"/>`;
  for (const u of units.municipalities) svg += `<path class="outline" data-mid="${u.id}" d="${d(u)}"/>`;
  svg += '<g class="labels">';
  for (const u of units.municipalities) {
    const [x,y] = labelAt(u);
    svg += `<text data-mid="${u.id}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${u.areaKm2 < 60 ? 'small' : ''}">${esc(u.name)}</text>`;
  }
  return choroCache[level] = svg+'</g></svg><div class="chart-tip" hidden></div>';
}
let choroLevel = null;
function quantileBreaks(values) {
  const v = values.filter(x => x != null && isFinite(x)).sort((a,b) => a-b);
  if (!v.length) return [0,0,0,0];
  return [.2,.4,.6,.8].map(q => v[Math.min(v.length-1,Math.floor(q*v.length))]);
}
function renderChoropleth() {
  const host = $('choropleth');
  if (choroLevel !== state.unitLevel) {
    host.innerHTML = choroSvg(state.unitLevel);
    choroLevel = state.unitLevel;
    const tip = host.querySelector('.chart-tip');
    host.querySelector('svg').onpointermove = event => {
      const id = event.target.dataset?.id;
      if (!id) { tip.hidden = true;return; }
      const u = units.byId[state.unitLevel].get(id), r = host.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.max(80,Math.min(r.width-80,event.clientX-r.left))+'px';
      tip.style.top = (event.clientY-r.top-10)+'px';
      tip.innerHTML = `<b>${esc(unitLabel(u))}</b><br>${METRICS[state.unitMetric].label}: <b>${METRICS[state.unitMetric].fmt(metricOf(u))}</b><br><small>${yearLabel(state.index)} · territori ${areaFmt(u.areaKm2)}</small>`;
    };
    host.querySelector('svg').onpointerleave = () => { tip.hidden = true; };
    host.querySelector('svg').onclick = event => {
      const id = event.target.dataset?.id;
      const u = id && units.byId[state.unitLevel].get(id);
      if (!u) return;
      if (u.level === 'cadastral' && !MUN.has(u.municipality)) toggleUnit(units.byId.municipalities.get(u.municipality));
      else toggleUnit(u);
    };
  }
  // Zoom the thematic map to the focused municipality so its zones are large enough to click.
  let box = choroCache.full;
  if (state.unitLevel === 'cadastral') {
    const ms = pickedMunicipalities(), b = [Math.min(...ms.map(m => m.bbox[0])),Math.min(...ms.map(m => m.bbox[1])),Math.max(...ms.map(m => m.bbox[2])),Math.max(...ms.map(m => m.bbox[3]))];
    const [x0,y1] = choroCache.project(b[0],b[1]), [x1,y0] = choroCache.project(b[2],b[3]);
    const pad = Math.max(x1-x0,y1-y0)*.06, ratio = choroCache.full[2]/choroCache.full[3];
    let w = x1-x0+2*pad, h = y1-y0+2*pad;
    if (w/h < ratio) w = h*ratio; else h = w/ratio;
    box = [(x0+x1)/2-w/2,(y0+y1)/2-h/2,w,h];
  }
  const svgEl = host.querySelector('svg');
  svgEl.setAttribute('viewBox',box.map(v => v.toFixed(1)).join(' '));
  // Keep label and outline sizes constant on screen when the map zooms to a municipality.
  svgEl.style.setProperty('--z',(box[2]/choroCache.full[2]).toFixed(4));
  for (const el of host.querySelectorAll('[data-mid]')) el.classList.toggle('on',MUN.has(el.dataset.mid));
  svgEl.classList.toggle('has-sel',MUN.size > 0);
  // Class breaks from the last step, so colours fill in as time advances.
  const last = count()-1, list = levelUnits();
  const breaks = quantileBreaks(list.map(u => metricOf(u,last)));
  const filter = state.unitLevel === 'cadastral';
  const sel = state.unitLevel === 'cadastral' ? ZONE : MUN;
  for (const el of host.querySelectorAll('path.u')) {
    const u = units.byId[state.unitLevel].get(el.dataset.id), v = metricOf(u);
    el.style.fill = v == null ? '#2a3240' : CHORO[breaks.filter(b => v > b).length];
    el.classList.toggle('sel',sel.has(u.id));
    el.classList.toggle('dim',filter && !MUN.has(u.municipality));
  }
  const fmt = METRICS[state.unitMetric].fmt, b = breaks;
  const ranges = [`≤ ${fmt(b[0])}`,`${fmt(b[0])} – ${fmt(b[1])}`,`${fmt(b[1])} – ${fmt(b[2])}`,`${fmt(b[2])} – ${fmt(b[3])}`,`> ${fmt(b[3])}`];
  $('choroLegend').innerHTML = CHORO.map((c,i) => `<span><i style="background:${c}"></i>${ranges[i]}</span>`).join('')+(state.unitMetric === 'growth' ? '<span><i style="background:#2a3240"></i>pa ndërtim fillestar</span>' : '')+`<span>· klasat sipas ${esc(yearLabel(last))}</span>`;
}
function multiLine(host,series,o) {
  const W = Math.max(260,host.clientWidth), H = 170, m = {l:46,r:10,t:10,b:20};
  const n = o.years.length, iw = W-m.l-m.r, ih = H-m.t-m.b;
  const values = series.flatMap(s => s.values).filter(v => v != null && isFinite(v));
  const lo = Math.min(0,...values), max = niceMax(Math.max(...values,1e-6));
  const x = i => m.l+(n === 1 ? iw/2 : i*iw/(n-1));
  const y = v => m.t+ih-(v-lo)/(max-lo)*ih;
  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.label)}">`;
  for (const t of [lo,(lo+max)/2,max]) svg += `<line class="${t === lo ? 'axis' : 'grid'}" x1="${m.l}" x2="${W-m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l-6}" y="${y(t)+3}" text-anchor="end">${o.tick(t)}</text>`;
  const ticks = o.years.map((_,i) => i).filter(i => n > 15 ? o.years[i]%5 === 0 : i%2 === 0 || i === n-1);
  for (const i of ticks) svg += `<text x="${x(i)}" y="${H-5}" text-anchor="middle">${o.years[i]}</text>`;
  svg += `<line class="cursor" x1="${x(o.active)}" x2="${x(o.active)}" y1="${m.t}" y2="${m.t+ih}" opacity=".4"/>`;
  for (const s of series) {
    const pts = s.values.map((v,i) => v == null ? null : x(i).toFixed(1)+','+y(v).toFixed(1)).filter(Boolean).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.ref ? 1.5 : 2}" class="${s.ref ? 'ref' : ''}" stroke-linejoin="round"/>`;
    const v = s.values[o.active];
    if (v != null && !s.ref) svg += `<circle cx="${x(o.active)}" cy="${y(v)}" r="3.5" fill="${s.color}" stroke="#090d15" stroke-width="1.5"/>`;
  }
  svg += `<line class="hover" x1="0" x2="0" y1="${m.t}" y2="${m.t+ih}" visibility="hidden"/><rect class="hit" x="${m.l}" y="0" width="${iw}" height="${H}"/></svg><div class="chart-tip" hidden></div>`;
  host.innerHTML = svg;
  const hit = host.querySelector('.hit'), tip = host.querySelector('.chart-tip'), hover = host.querySelector('.hover');
  const pick = event => Math.max(0,Math.min(n-1,Math.round((event.clientX-host.getBoundingClientRect().left-m.l)/iw*(n-1))));
  hit.onpointermove = event => {
    const i = pick(event);
    hover.setAttribute('x1',x(i));hover.setAttribute('x2',x(i));hover.setAttribute('visibility','visible');
    tip.hidden = false;
    tip.style.left = Math.max(90,Math.min(W-90,x(i)))+'px';
    tip.style.top = '14px';
    tip.style.transform = 'translate(-50%,0)';
    tip.innerHTML = `<b>${esc(o.labels[i])}</b><br>`+series.map(s => `<span style="color:${s.color}">●</span> ${esc(s.name)}: <b>${o.fmt(s.values[i])}</b>`).join('<br>');
  };
  hit.onpointerleave = () => { tip.hidden = true;hover.setAttribute('visibility','hidden'); };
  hit.onclick = event => setIndex(pick(event));
}
function renderUnitTable() {
  const cad = state.unitLevel === 'cadastral', last = state.index, metric = METRICS[state.unitMetric];
  const query = normalize(state.unitQuery.trim());
  let rows = filteredUnits().filter(u => !query || normalize(unitLabel(u)).includes(query));
  const cols = [
    {key:'name',label:cad ? C.unit2.One : C.unit1.One,l:true,val:u => u.name,show:u => esc(u.name)},
    ...(cad ? [{key:'mun',label:C.unit1.One,l:true,val:u => munName(u.municipality),show:u => esc(munName(u.municipality))}] : []),
    {key:'area',label:'Territori',val:u => u.areaKm2,show:u => areaFmt(u.areaKm2)},
    {key:'base',label:period().steps[0].short,val:u => u[state.period][0],show:u => areaFmt(u[state.period][0])},
    {key:'now',label:period().steps[last].short,val:u => u[state.period][last],show:u => areaFmt(u[state.period][last])},
    {key:'share',label:'% terr.',val:u => metricOf(u,last,'share'),show:u => METRICS.share.fmt(metricOf(u,last,'share'))},
    {key:'growth',label:'Rritja',val:u => metricOf(u,last,'growth') ?? -1e9,show:u => METRICS.growth.fmt(metricOf(u,last,'growth'))},
    ...(['share','growth'].includes(state.unitMetric) ? [] : [{key:'metric',label:metric.label.split(' ')[0],val:u => metricOf(u,last) ?? -1e9,show:u => metric.fmt(metricOf(u,last))}]),
  ];
  const sortKey = cols.some(c => c.key === state.unitSort.key) ? state.unitSort.key : (cols.find(c => c.key === state.unitMetric) ? state.unitMetric : 'metric');
  const col = cols.find(c => c.key === sortKey) || cols.find(c => c.key === 'share');
  const dir = state.unitSort.dir;
  rows.sort((a,b) => { const x = col.val(a), y = col.val(b);return (typeof x === 'string' ? x.localeCompare(y,'sq') : x-y)*dir; });
  const sel = state.unitLevel === 'cadastral' ? ZONE : MUN, limit = 400;
  $('unitTable').tHead.innerHTML = '<tr><th class="l"></th>'+cols.map(c => `<th data-key="${c.key}" class="${c.l ? 'l' : ''} ${c === col ? 'sorted' : ''}">${esc(c.label)}${c === col ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')+'</tr>';
  $('unitTable').tBodies[0].innerHTML = rows.slice(0,limit).map(u => `<tr data-id="${u.id}" class="${sel.has(u.id) ? 'sel' : ''}"><td class="l"><input type="checkbox" ${sel.has(u.id) ? 'checked' : ''} aria-label="Zgjidh ${esc(u.name)}"></td>`+cols.map(c => `<td class="${c.l ? 'l' : ''}" title="${c.l ? esc(c.show(u)) : ''}">${c.show(u)}</td>`).join('')+'</tr>').join('');
  $('tableNote').textContent = rows.length > limit ? `Shfaqen ${limit} nga ${rows.length} njësi. Përdor kërkimin ose filtrin për të ngushtuar listën; CSV-ja i përfshin të gjitha.` : `${rows.length} njësi · vlerat për ${yearLabel(last)}.`;
}
function renderUnits() {
  if (!units) return;
  const cad = state.unitLevel === 'cadastral';
  renderPickers();
  const n = filteredUnits().length, mNames = pickedMunicipalities().map(m => m.name).join(', ');
  $('tableTitle').innerHTML = `Renditja <small>${cad ? `${n} ${esc(C.unit2.many)} · ${esc(mNames)}` : `${n} ${esc(C.unit1.many)} · kliko për ta shtuar në filtër`} · kliko titullin e kolonës për renditje</small>`;  $('metricNote').textContent = METRICS[state.unitMetric].note;
  renderChoropleth();
  const picked = selectedUnits(), p = state.period, i = state.index, metric = METRICS[state.unitMetric];
  const chosen = filterUnits();
  $('selCount').textContent = chosen.length ? `${chosen.length} njësi në filtër` : `pa filtër · zgjidh ${C.unit1.the} lart, ose kliko në hartë`;
  const group = chosen.length ? aggregate(chosen,chosen.length === 1 ? chosen[0].name : 'Përzgjedhja') : null;
  if (group) {
    const s = group[p], share = s[i]/group.areaKm2*100, kShare = units.kosovo[p][i]/units.kosovo.areaKm2*100;
    let story = `${chosen.length === 1 ? `<b>${esc(unitLabel(chosen[0]))}</b>` : `<b>${chosen.length} njësitë e zgjedhura</b>`} kanë territor ${areaFmt(group.areaKm2)}. Në ${esc(yearLabel(i))} ishin të ndërtuara <b>${areaFmt(s[i])}</b>, pra <b>${METRICS.share.fmt(share)}</b> e territorit (mesatarja: ${METRICS.share.fmt(kShare)} · ${esc(C.name)}).`;
    if (i > 0) story += ` Nga ${esc(yearLabel(0))}: <b>${METRICS.growth.fmt(metricOf(group,i,'growth'))}</b>, ose <b>+${areaFmt(s[i]-s[0])}</b>.`;
    if (chosen.length > 1 && i > 0) {
      const ranked = chosen.map(u => [u,metricOf(u,i,'growth')]).filter(r => r[1] != null).sort((a,b) => b[1]-a[1]);
      if (ranked.length) story += ` Rritja më e shpejtë: <b>${esc(ranked[0][0].name)}</b> (${METRICS.growth.fmt(ranked[0][1])}).`;
    }
    $('selStory').innerHTML = story;
  } else $('selStory').innerHTML = `Pa përzgjedhje, grafiku tregon gjithë territorin (${esc(C.name)}). Zgjidh një ose më shumë ${cad ? C.unit2.many : C.unit1.many} për t'i krahasuar.`;
  const years = period().steps.map(s => s.year), labels = period().steps.map(s => s.label);
  const seriesOf = (u,color,extra={}) => ({name:u === units.kosovo ? C.name : unitLabel(u),color,values:labels.map((_,k) => metricOf(u,k)),...extra});
  let series;
  if (!chosen.length) series = [seriesOf(units.kosovo,'#66e0d1')];
  else if (chosen.length <= 8) series = chosen.map((u,k) => seriesOf(u,UNIT_COLORS[k]));
  else series = [seriesOf(group,'#66e0d1',{name:`Përzgjedhja (${chosen.length})`})];
  if (picked.length && MUN.size === 1) series.push(seriesOf(pickedMunicipalities()[0],'#c8d3e0',{ref:true,name:pickedMunicipalities()[0].name+' (e plotë)'}));
  if (chosen.length && ['share','growth','intensity'].includes(state.unitMetric)) series.push(seriesOf(units.kosovo,'#8a98ab',{ref:true,name:C.name+' (referencë)'}));
  $('unitChartTitle').innerHTML = `${metric.label} <small>${chosen.length > 8 ? 'përzgjedhja si një e tërë' : 'çdo vijë një njësi'}${series.some(s => s.ref) ? ` · vijat e ndërprera: ${picked.length && MUN.size === 1 ? 'komuna dhe ' : ''}Kosova` : ''}</small>`;
  multiLine($('chartUnits'),series,{years,labels,active:i,label:metric.label,fmt:metric.fmt,tick:v => state.unitMetric === 'built' || state.unitMetric === 'added' ? number(Math.round(v*100)/100) : number(Math.round(v*10)/10)});
  renderUnitTable();
}
function setUnitLevel(level) {
  state.unitLevel = level;
  document.querySelectorAll('[data-level]').forEach(b => { b.classList.toggle('active',b.dataset.level === level);b.setAttribute('aria-checked',String(b.dataset.level === level)); });
  state.unitSort = {key:'metric',dir:-1};
  afterSelection();
}
function zoomToSelection() { zoomToUnits(filterUnits()); }
function zoomToUnits(chosen,label) {
  if (!chosen.length) return;
  const w = Math.min(...chosen.map(u => u.bbox[0])), s = Math.min(...chosen.map(u => u.bbox[1]));
  const e = Math.max(...chosen.map(u => u.bbox[2])), n = Math.max(...chosen.map(u => u.bbox[3]));
  const lat = (s+n)/2, lon = (w+e)/2;
  const wKm = (e-w)*111.32*Math.cos(lat*Math.PI/180), hKm = (n-s)*111.132;
  // With the radial diagram on, the whole unit must fit inside the lens circle.
  const km = state.radial ? Math.hypot(wKm,hKm)/(2*RADIAL.lens)*1.04 : Math.max(wKm,hKm)*1.15;
  Object.assign(state,{lat,lon,span:Math.max(2,Math.min(190,Math.round(km*10)/10)),name:label || (chosen.length === 1 ? chosen[0].name : 'Përzgjedhja')});
  $('search').value = state.name;
  loadView();
}
function exportCsv() {
  const chosen = filterUnits(), list = chosen.length ? chosen : filteredUnits();
  const cad = state.unitLevel === 'cadastral', ev = period('evolution'), tr = period('tracker');
  const head = ['niveli','id','emri',...(cad ? ['njesia_1'] : []),'territori_ha',...ev.steps.map(s => 'evolution_'+s.label.replace(' ','_')+'_ha'),...tr.steps.map(s => 'tracker_'+s.label.replace(' ','_')+'_ha')];
  const toHa = (v,d = 2) => Math.round(v*100*10**d)/10**d;  // km² → ha
  const q = v => /[",;\n]/.test(String(v)) ? '"'+String(v).replace(/"/g,'""')+'"' : String(v);
  const lines = [head.join(',')].concat(list.map(u => [u.level === 'cadastral' ? 'niveli_2' : 'niveli_1',u.id,u.name,...(cad ? [u.level === 'cadastral' ? munName(u.municipality) : u.name] : []),toHa(u.areaKm2,1),...u.evolution.map(v => toHa(v)),...u.tracker.map(v => toHa(v))].map(q).join(',')));
  const blob = new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  download(blob,`atlasi-urban-${C.id.toLowerCase()}-${cad ? 'niveli-2' : 'niveli-1'}-${manifest.updated || 'te-dhenat'}.csv`);
}
document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => setUnitLevel(b.dataset.level));
$('unitMetric').onchange = () => { state.unitMetric = $('unitMetric').value;state.unitSort = {key:state.unitMetric,dir:-1};renderUnits(); };
$('selZoom').onclick = zoomToSelection;
$('selCsv').onclick = exportCsv;
$('unitTable').onclick = event => {
  const th = event.target.closest('th[data-key]');
  if (th) { state.unitSort = {key:th.dataset.key,dir:state.unitSort.key === th.dataset.key ? -state.unitSort.dir : (th.classList.contains('l') ? 1 : -1)};renderUnitTable();return; }
  const tr = event.target.closest('tr[data-id]');
  if (tr) toggleUnit(units.byId[state.unitLevel].get(tr.dataset.id));
};
$('toggleUnits').onclick = () => setLayer('unitsOverlay',!state.unitsOverlay);

// ---------- Pickers: municipalities (multi), then zones inside them (multi) ----------
const pickers = {
  mun:{btn:'munBtn',panel:'munPanel',filter:'munFilter',list:'munList',key:null},
  zone:{btn:'zoneBtn',panel:'zonePanel',filter:'zoneFilter',list:'zoneList',key:null},
};
function renderPickers() {
  const ms = pickedMunicipalities(), zones = selectedUnits();
  const short = list => list.length <= 2 ? list.map(u => u.name).join(', ') : `${list.length}: ${list.slice(0,2).map(u => u.name).join(', ')}…`;
  $('munBtnText').textContent = ms.length ? short(ms) : `${C.whole} · ${units.municipalities.length} ${C.unit1.many}`;
  $('zoneBtn').disabled = !ms.length;
  $('zoneBtnText').textContent = !ms.length ? `Zgjidh fillimisht ${C.unit1.acc}` : zones.length ? short(zones) : `${C.unit1.Many} e plota · ${filteredUnits().length} ${C.unit2.many}`;
  if (!ms.length) closePicker('zone');
  // Lists are rebuilt only when their content changes, so scrolling and typing are not interrupted.
  const mq = normalize($('munFilter').value.trim());
  if (pickers.mun.key !== mq) {
    pickers.mun.key = mq;
    $('munList').innerHTML = [...units.municipalities].sort((a,b) => a.name.localeCompare(b.name,'sq')).filter(u => !mq || normalize(u.name).includes(mq))
      .map(u => `<label class="zone-opt" role="option"><input type="checkbox" data-mun="${u.id}"><span>${esc(u.name)}</span><small>${areaFmt(u.areaKm2)}</small></label>`).join('') || '<div class="find-empty">Asnjë komunë me këtë emër.</div>';
  }
  const zq = normalize($('zoneFilter').value.trim()), zkey = [...MUN].sort().join('.')+'|'+zq;
  if (pickers.zone.key !== zkey) {
    pickers.zone.key = zkey;
    const groups = ms.slice().sort((a,b) => a.name.localeCompare(b.name,'sq')).map(m => {
      const list = units.cadastral.filter(u => u.municipality === m.id && (!zq || normalize(u.name).includes(zq))).sort((a,b) => a.name.localeCompare(b.name,'sq'));
      if (!list.length) return '';
      return (ms.length > 1 ? `<div class="ms-group">${esc(m.name)}</div>` : '')+list.map(u => `<label class="zone-opt" role="option"><input type="checkbox" data-zone="${u.id}"><span>${esc(u.name)}</span><small>${areaFmt(u.areaKm2)}</small></label>`).join('');
    }).join('');
    $('zoneList').innerHTML = groups || '<div class="find-empty">Asnjë zonë me këtë emër.</div>';
  }
  for (const box of $('munList').querySelectorAll('input')) box.checked = MUN.has(box.dataset.mun);
  for (const box of $('zoneList').querySelectorAll('input')) box.checked = ZONE.has(box.dataset.zone);
  // Active filter, as removable chips.
  const chips = ms.map(m => {
    const own = zones.filter(z => z.municipality === m.id);
    return `<button class="chip mun" data-rm-mun="${m.id}" title="Hiqe ${esc(C.unit1.acc)} nga filtri">${esc(m.name)}${own.length ? ` <span>· ${own.length} ${esc(C.unit2.many)}</span>` : ' <span>· e plotë</span>'} <span>×</span></button>`+
      own.map(z => `<button class="chip" data-rm-zone="${z.id}" title="Hiqe zonën nga filtri">${esc(z.name)} <span>×</span></button>`).join('');
  }).join('');
  $('activeFilter').innerHTML = chips ? chips+'<button class="clear" data-clear>Hiq filtrin</button>' : '';
}
function openPicker(name) {
  const p = pickers[name];
  if ($(p.btn).disabled) return;
  closePicker(name === 'mun' ? 'zone' : 'mun');
  $(p.panel).hidden = false;
  $(p.btn).setAttribute('aria-expanded','true');
  $(p.filter).focus();
}
function closePicker(name) {
  const p = pickers[name];
  $(p.panel).hidden = true;
  $(p.btn).setAttribute('aria-expanded','false');
}
for (const name of ['mun','zone']) {
  const p = pickers[name];
  $(p.btn).onclick = () => $(p.panel).hidden ? openPicker(name) : closePicker(name);
  $(p.filter).oninput = () => renderPickers();
  $(p.panel).addEventListener('keydown',event => { if (event.key === 'Escape') { closePicker(name);$(p.btn).focus(); } });
}
$('munList').onchange = event => {
  const id = event.target.dataset.mun;
  if (!id) return;
  event.target.checked ? MUN.add(id) : MUN.delete(id);
  afterSelection();
};
$('zoneList').onchange = event => {
  const id = event.target.dataset.zone;
  if (!id) return;
  event.target.checked ? ZONE.add(id) : ZONE.delete(id);
  afterSelection();
};
$('munNone').onclick = () => { closePicker('mun');clearFilter(); };
$('zoneNone').onclick = () => { ZONE.clear();afterSelection(); };
$('munDone').onclick = () => closePicker('mun');
$('zoneDone').onclick = () => closePicker('zone');
document.addEventListener('pointerdown',event => {
  if (!$('munPanel').hidden && !$('munPick').contains(event.target)) closePicker('mun');
  if (!$('zonePanel').hidden && !$('zonePick').contains(event.target)) closePicker('zone');
});
$('activeFilter').onclick = event => {
  const t = event.target.closest('button');
  if (!t) return;
  if (t.dataset.clear !== undefined) return clearFilter();
  if (t.dataset.rmMun) { MUN.delete(t.dataset.rmMun);afterSelection(); }
  if (t.dataset.rmZone) { ZONE.delete(t.dataset.rmZone);afterSelection(); }
};
// The same filter state on the map: a chip to remove it, and a notice when it is out of view.
function showFilterState() {
  const fm = filterMask, byUnits = fm?.kind === 'units';
  $('filterChip').hidden = !byUnits;
  if (byUnits) $('filterName').textContent = fm.label;
  const away = byUnits && fm.inside === 0;
  $('filterAway').hidden = !away;
  if (away) $('filterAwayText').innerHTML = `Filtri <b>${esc(fm.label)}</b> nuk ndodhet ${fm.circle ? 'brenda rrethit' : 'në këtë pamje'}.`;
}
$('filterGo').onclick = () => zoomToUnits(filterUnits());
$('filterOff').onclick = clearFilter;
$('filterChip').onclick = clearFilter;

// ---------- Statistics for every step and descriptive measures ----------
function quantile(sorted,q) {
  // Linear interpolation between order statistics (the default in R and Excel's QUARTILE.INC).
  if (!sorted.length) return null;
  const pos = (sorted.length-1)*q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);
}
function describe(values,decimals) {
  const v = values.filter(x => x != null && isFinite(x));
  if (!v.length) return null;
  const sorted = [...v].sort((a,b) => a-b), n = v.length, mean = v.reduce((a,b) => a+b,0)/n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a,b) => a+(b-mean)**2,0)/(n-1)) : 0;
  // Mode of values rounded to the displayed precision; none when no value repeats.
  const f = 10**decimals, counts = new Map();
  for (const x of v) { const r = Math.round(x*f)/f;counts.set(r,(counts.get(r) || 0)+1); }
  const top = Math.max(...counts.values());
  const modes = top > 1 ? [...counts].filter(([,c]) => c === top).map(([x]) => x).sort((a,b) => a-b) : [];
  return {n,mean,median:quantile(sorted,.5),modes,modeCount:top,sd,q1:quantile(sorted,.25),q3:quantile(sorted,.75),min:sorted[0],max:sorted[n-1]};
}
function zoneStatistics() {
  const s = viewStats;
  if (!s) return null;
  const c = s.cumulative, steps = period().steps, land = s.landKm2 || 0;
  const rows = steps.map((step,k) => ({
    label:step.label,short:step.short,
    builtHa:c[k]*100,
    share:land ? c[k]/land*100 : null,
    addHa:k ? (c[k]-c[k-1])*100 : null,
    rate:k && c[k-1] > 0 ? (c[k]/c[k-1]-1)*100 : null,
  }));
  return {rows,landHa:land*100,add:describe(rows.map(r => r.addHa),1),rate:describe(rows.map(r => r.rate),1)};
}
const fmt1 = v => v == null ? '—' : number(Math.round(v*10)/10);
const fmt2 = v => v == null ? '—' : number(Math.round(v*100)/100);
const modeText = (d,unit) => !d || !d.modes.length ? 'pa përsëritje' : d.modes.slice(0,2).map(m => fmt1(m)+unit).join(', ')+(d.modes.length > 2 ? '…' : '')+` (${d.modeCount}×)`;
const DESC_ROWS = [['Mesatarja','mean'],['Mediana','median'],['Modusi','mode'],['Devijimi standard','sd'],['Kuartili i parë (Q1)','q1'],['Kuartili i tretë (Q3)','q3'],['Minimumi','min'],['Maksimumi','max']];
function renderZoneStatistics() {
  const z = zoneStatistics();
  if (!z) { $('descStats').innerHTML = '';$('yearTable').innerHTML = '';return; }
  const cell = (d,key,unit) => !d ? '—' : key === 'mode' ? modeText(d,unit) : fmt1(d[key])+unit;
  $('descStats').innerHTML = `<table class="desc"><thead><tr><th></th><th>Shtesa vjetore</th><th>Rritja vjetore</th></tr></thead><tbody>`+
    DESC_ROWS.map(([label,key]) => `<tr><td>${label}</td><td>${cell(z.add,key,' ha')}</td><td>${cell(z.rate,key,'%')}</td></tr>`).join('')+
    `</tbody></table><p class="note">${z.add?.n || 0} vlera vjetore · zona e analizuar: ${fmt1(z.landHa)} ha. Rritja vjetore = shtesa e vitit ndaj sipërfaqes së ndërtuar një vit më parë.</p>`;
  $('yearTable').innerHTML = `<table class="years"><thead><tr><th>Viti</th><th>Ndërtuar (ha)</th><th>% e zonës</th><th>Shtesa (ha)</th><th>Rritja (%)</th></tr></thead><tbody>`+
    z.rows.map((r,k) => `<tr class="${k === state.index ? 'now' : ''}"><td>${esc(r.label)}</td><td>${fmt1(r.builtHa)}</td><td>${fmt2(r.share)}</td><td>${r.addHa == null ? '—' : '+'+fmt1(r.addHa)}</td><td>${r.rate == null ? '—' : '+'+fmt1(r.rate)}</td></tr>`).join('')+'</tbody></table>';
}
// ---------- Export the current view as SVG or PNG, with legend, statistics and authorship ----------
const AUTHOR = 'Rizah Murseli';
const xml = text => String(text).replace(/[&<>"']/g,ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const clip = (text,max) => text.length > max ? text.slice(0,max-1)+'…' : text;
function exportSvg() {
  if (!sample || !view || !viewStats) throw new Error('Harta nuk është ngarkuar ende.');
  const r = canvas.width/canvas.clientWidth;
  const S = Math.max(640,Math.round(view.size/r)), sx = S/(view.size/r), ox = view.x/r, oy = view.y/r;
  const P = 640, W = S+P, H = S;
  const crop = document.createElement('canvas');
  crop.width = crop.height = view.size;
  crop.getContext('2d').drawImage(canvas,view.x,view.y,view.size,view.size,0,0,view.size,view.size);
  let mapImage;
  try { mapImage = crop.toDataURL('image/png'); }
  catch { throw new Error('Harta bazë nuk lejon eksportin. Fikni "Harta OSM" dhe provoni përsëri.'); }
  const palette = colors(), i = state.index, steps = period().steps, fm = viewStats.filter, z = zoneStatistics();
  const scope = !fm ? 'në pamje' : fm.kind === 'circle' ? 'brenda rrethit' : fm.circle ? 'brenda rrethit dhe filtrit' : 'brenda filtrit';
  const kmPerPx = state.span/S, nice = [.25,.5,1,2,5,10,20,50].find(k => k/kmPerPx >= S/6) || 50, barPx = nice/kmPerPx;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
text{font-family:'DM Sans',Arial,sans-serif;fill:#e8eef6}
.mono{font-family:'Space Mono',Consolas,monospace}
.muted{fill:#94a6bd}.accent{fill:#66e0d1}
.radial-lens{fill:none;stroke:#66e0d1;stroke-width:1.2;stroke-dasharray:3 4;opacity:.8}
.radial-base{fill:none;stroke:#5d708a;stroke-width:1}.radial-now{stroke:#fff;stroke-width:1.5}
.radial-year{fill:#8aa0bb;font:8.5px 'Space Mono',Consolas,monospace}
.radial-label{fill:#e8eef6;font:700 10px 'DM Sans',Arial,sans-serif;letter-spacing:1.5px}
.radial-hit,.radial-dim{fill:none}
</style>
<rect width="${W}" height="${H}" fill="#090d15"/>
<clipPath id="mapclip"><rect width="${S}" height="${S}"/></clipPath>
<g clip-path="url(#mapclip)"><image width="${S}" height="${S}" href="${mapImage}" xlink:href="${mapImage}"/>`;
  if (state.radial && $('radial').innerHTML) out += `<g transform="scale(${sx.toFixed(4)}) translate(${(-ox).toFixed(2)},${(-oy).toFixed(2)})">${$('radial').innerHTML}</g>`;
  out += `</g>
<rect x="18" y="${S-46}" width="${barPx.toFixed(1)}" height="4" fill="#e8eef6"/><text x="18" y="${S-24}" class="mono" font-size="11">${number(nice)} km</text>
<text x="18" y="${S-10}" font-size="9" class="muted">© ${xml(AUTHOR)} · ${xml(C.atlas)}</text>
<rect x="${S}" width="${P}" height="${H}" fill="#0d1520"/><line x1="${S}" x2="${S}" y2="${H}" stroke="#263244"/>`;
  // Column A: title, year, legend, summary and descriptive statistics.
  const ax = S+24, aw = 280, aRight = ax+aw;
  let y = 36;
  const text = (t,size,cls='',weight=400,dy=0,x=ax,anchor='start') => { y += dy;out += `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" class="${cls}" text-anchor="${anchor}">${xml(t)}</text>`; };
  text('ATLASI URBAN · KOSOVË',9.5,'accent mono',700);
  text(clip(state.name.toUpperCase(),24),20,'',700,26);
  text(period().source,9.5,'muted mono',400,17);
  const yearColor = 'rgb('+palette[i].join(',')+')';
  y += 50;
  out += `<text x="${ax}" y="${y}" font-size="46" class="mono" style="fill:${yearColor}">${xml(steps[i].label.replace(/^Janar /,''))}</text>`;
  if (steps[i].epoch) text(steps[i].epoch,8.5,'muted',400,15);
  text('Viti kur u identifikua ndërtimi',11,'',700,26);
  const bw = aw/steps.length;
  y += 8;
  steps.forEach((s,k) => { out += `<rect x="${(ax+k*bw).toFixed(1)}" y="${y}" width="${Math.max(1,bw-1).toFixed(1)}" height="10" fill="rgb(${palette[k].join(',')})" opacity="${k > i ? .3 : 1}"/>`; });
  const ticks = steps.map((_,k) => k).filter(k => steps.length <= 13 ? k%2 === 0 || k === steps.length-1 : steps[k].year%5 === 0 || k === steps.length-1);
  for (const k of ticks) out += `<text x="${(ax+k*bw+bw/2).toFixed(1)}" y="${y+22}" font-size="8" text-anchor="middle" class="muted mono">${xml(steps[k].short)}</text>`;
  y += 22;
  out += `<rect x="${ax}" y="${y+11}" width="11" height="9" fill="rgb(${palette[0].join(',')})"/>`;
  y += 19;
  out += `<text x="${ax+17}" y="${y}" font-size="9.5" class="muted">${xml('gri: ndërtuar deri në '+steps[0].label.toLowerCase())}</text>`;
  text('Përmbledhje',11,'',700,26);
  if (fm?.kind === 'units') text(clip('Filtri: '+fm.label,44),9.5,'accent',600,15);
  if (fm?.circle || fm?.kind === 'circle') text(`Rrethi: rreze ${number(Math.round(viewStats.lensKm*10)/10)} km`,9.5,'muted',400,14);
  // A row whose label and value would collide puts the value on its own line.
  const row = (label,value) => {
    y += 17;
    out += `<text x="${ax}" y="${y}" font-size="10" class="muted">${xml(label)}</text>`;
    if (label.length*5.1+value.length*6.4 > aw-8) y += 14;
    out += `<text x="${aRight}" y="${y}" font-size="10.5" text-anchor="end" class="mono">${xml(value)}</text>`;
  };
  const cur = z.rows[i], base = z.rows[0];
  row('Zona e analizuar',fmt1(z.landHa)+' ha');
  row(`Ndërtuar ${scope}, ${steps[i].short}`,`${fmt1(cur.builtHa)} ha · ${fmt2(cur.share)}%`);
  row(`Ndërtuar në ${steps[0].label.toLowerCase()}`,`${fmt1(base.builtHa)} ha · ${fmt2(base.share)}%`);
  if (i > 0) row('Rritja nga gjendja fillestare',`+${fmt1(cur.builtHa-base.builtHa)} ha · +${base.builtHa > 0 ? fmt1((cur.builtHa/base.builtHa-1)*100) : '—'}%`);
  if (state.radial && viewStats.radial) {
    const dirs = viewStats.radial.map(d => d.reduce((a,band) => a+band.slice(2,i+2).reduce((p,q) => p+q,0),0)*100);
    row('Shtesat sipas drejtimit (ha)',DIRS.map((d,k) => d[0]+' '+fmt1(dirs[k])).join(' · '));
  }
  const yA = y;
  // Column B (top right): descriptive statistics of the yearly series.
  const bx = ax+aw+30, bRight = S+P-22;
  y = 36;
  text('Statistikat përshkruese',11,'',700,0,bx);
  text(`${steps[1].short}–${steps[i].short} · ${Math.max(0,i)} vlera vjetore`,8.5,'muted',400,14,bx);
  const zi = {add:describe(z.rows.slice(1,i+1).map(r => r.addHa),1),rate:describe(z.rows.slice(1,i+1).map(r => r.rate),1)};
  const c1 = bx+180, c2 = bRight;
  y += 20;
  out += `<text x="${c1}" y="${y}" font-size="8.5" text-anchor="end" class="muted">Shtesa vjetore</text><text x="${c2}" y="${y}" font-size="8.5" text-anchor="end" class="muted">Rritja vjetore</text>`;
  for (const [label,key] of DESC_ROWS) {
    y += 16;
    const v = (d,unit) => !d ? '—' : key === 'mode' ? modeText(d,unit) : fmt1(d[key])+unit;
    out += `<text x="${bx}" y="${y}" font-size="9.5" class="muted">${xml(label)}</text><text x="${c1}" y="${y}" font-size="9.5" text-anchor="end" class="mono">${xml(v(zi.add,' ha'))}</text><text x="${c2}" y="${y}" font-size="9.5" text-anchor="end" class="mono">${xml(v(zi.rate,'%'))}</text>`;
  }
  y += 14;
  out += `<text x="${bx}" y="${y}" font-size="8" class="muted">Rritja vjetore = shtesa e vitit ndaj sipërfaqes</text><text x="${bx}" y="${y+11}" font-size="8" class="muted">së ndërtuar një vit më parë.</text>`;
  y += 11;
  const yB = y;
  // Two linked panels over the same years: the total (with this year's addition as a coloured cap) and the
  // yearly addition on its own scale, with mean, median, peak and context events, plus an interpretive caption.
  const gx = ax, gRight = bRight, gBottom = H-122;
  const bars = z.rows.slice(1), m = bars.length, shown = bars.slice(0,Math.max(1,i));
  const baseRgb = 'rgb('+palette[0].join(',')+')';
  const label = v => v >= 10 ? number(Math.round(v)) : fmt1(v);
  // Caption: the reading of the chart in two sentences.
  const first = z.rows[0], last = z.rows[i], peak = shown.reduce((a,b) => (b.addHa || 0) > (a.addHa || 0) ? b : a,shown[0]);
  const splitYear = steps.some(st => st.year === 1999) && i > stepIndexOfYear(1999) ? 1999 : null;
  const before = shown.filter(b => splitYear ? Number(b.short) <= splitYear : shown.indexOf(b) < shown.length/2);
  const after = shown.filter(b => !before.includes(b));
  const avg = list => list.length ? list.reduce((a,b) => a+(b.addHa || 0),0)/list.length : 0;
  // The reading of the chart goes in column B, under the descriptive statistics.
  const wrap = (t,max) => t.split(' ').reduce((lines,word) => { const l = lines[lines.length-1];if ((l+' '+word).trim().length > max) lines.push(word);else lines[lines.length-1] = (l+' '+word).trim();return lines; },['']);
  y = yB+30;
  text('Si u rrit zona e ndërtuar',11,'',700,0,bx);
  const times = first.builtHa > 0 ? last.builtHa/first.builtHa : null;
  const line1 = i ? `Nga ${steps[0].short} në ${steps[i].short}: ${label(first.builtHa)} → ${label(last.builtHa)} ha${times ? `, ${number(Math.round(times*10)/10)} herë më shumë` : ''} (+${label(last.builtHa-first.builtHa)} ha).` : 'Gjendja fillestare: zgjidhni një vit të mëvonshëm për të parë rritjen.';
  const line2 = i > 1 ? `Kulmi: ${peak.short} me +${label(peak.addHa)} ha. `+(after.length && before.length ? (splitYear ? `Para 1999 mesatarisht ${label(avg(before))} ha/vit, pas 1999 ${label(avg(after))} ha/vit (${avg(before) > 0 ? '×'+number(Math.round(avg(after)/avg(before)*10)/10) : ''}).` : `Gjysma e parë ${label(avg(before))} ha/vit, e dyta ${label(avg(after))} ha/vit.`) : '') : '';
  let dy = 17;
  for (const t of [line1,line2].filter(Boolean)) { for (const ln of wrap(t,54)) { text(ln,9.5,'muted',400,dy,bx);dy = 13; } dy = 17; }
  const gTop = Math.max(yA,y)+30, axisW = 34, px0 = gx+axisW, pw = gRight-px0, slot = pw/m, barW = Math.max(2,slot*.66);
  const totalH = Math.round((gBottom-gTop)*.46), gap = 24;
  const aTop = gTop+52, aBottom = gTop+totalH, bTop = aBottom+gap+12, bBottom = gBottom;
  const xAt = k => px0+k*slot+(slot-barW)/2, cxAt = k => (xAt(k)+barW/2).toFixed(1);
  const vlabel = (cx,ty,t,size,extra='') => `<text x="${cx}" y="${ty}" font-size="${size}" class="mono" text-anchor="start" dominant-baseline="middle" transform="rotate(-90 ${cx} ${ty})"${extra}>${xml(t)}</text>`;
  const labelSize = Math.min(8,Math.max(5.5,barW*.8)).toFixed(1);
  // Decades: light hatched bands behind both panels (every other decade), each labelled with its change.
  out += `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#c8d3e0" stroke-width="1" opacity=".16"/></pattern></defs>`;
  const decades = [];
  bars.forEach((b,k) => {
    const d = Math.floor(Number(b.short)/10)*10;
    if (!decades.length || decades[decades.length-1].d !== d) decades.push({d,from:k,to:k});
    else decades[decades.length-1].to = k;
  });
  decades.forEach((dec,n) => {
    const x0 = px0+dec.from*slot, x1 = px0+(dec.to+1)*slot;
    // The bands start at a label strip above the total panel, so decade labels never meet bar values.
    const bandTop = gTop+8;
    if (n%2 === 0) out += `<rect x="${x0.toFixed(1)}" y="${bandTop}" width="${(x1-x0).toFixed(1)}" height="${(bBottom-bandTop).toFixed(1)}" fill="url(#hatch)"/>`;
    out += `<line x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="${bandTop}" y2="${bBottom}" stroke="#2a3850" stroke-width="1"/>`;
    // Change within the decade, counted only up to the year on display.
    const last = Math.min(dec.to,i-1);
    if (last < dec.from) return;
    const startBuilt = z.rows[dec.from].builtHa, added = z.rows[last+1].builtHa-startBuilt;
    const yearsTxt = `${bars[dec.from].short}–${bars[last].short}`;
    const pct = startBuilt > 0 ? ` (+${number(Math.round(added/startBuilt*100))}%)` : '';
    const wide = x1-x0 > 110;
    out += `<text x="${(x0+4).toFixed(1)}" y="${gTop+18}" font-size="8" font-weight="700" style="fill:#c8d3e0">${xml(yearsTxt)}</text>`;
    out += `<text x="${(x0+4).toFixed(1)}" y="${gTop+29}" font-size="8" class="mono accent">${xml('+'+label(added)+' ha'+(wide ? pct : ''))}</text>`;
    if (!wide && pct) out += `<text x="${(x0+4).toFixed(1)}" y="${gTop+39}" font-size="8" class="mono accent">${xml(pct.trim())}</text>`;
  });
  // Context events (Evolution only): vertical guides through both panels.
  for (const ev of steps.some(st => st.year === 1999) ? events : []) {
    const k = bars.findIndex(b => Number(b.short) === ev.year);
    if (k < 0) continue;
    const cx = cxAt(k);
    out += `<line x1="${cx}" x2="${cx}" y1="${aTop}" y2="${bBottom}" stroke="#5d708a" stroke-dasharray="2 3"/><text x="${Number(cx)+3}" y="${aBottom+13}" font-size="8" class="muted">${xml(ev.label)}</text>`;
  }
  // Panel A: total built-up area, the cap is the addition of that year.
  const tmax = niceMax(Math.max(...bars.map(b => b.builtHa || 0),1e-6)*1.22);
  const ya = v => aBottom-v/tmax*(aBottom-aTop);
  out += `<text x="${gx}" y="${gTop+2}" font-size="9" font-weight="700">Gjithsej e ndërtuar (ha)</text>`;
  for (const t of [tmax/2,tmax]) out += `<line x1="${px0}" x2="${gRight}" y1="${ya(t)}" y2="${ya(t)}" stroke="#1e2a3a"/><text x="${px0-4}" y="${ya(t)+3}" font-size="7.5" text-anchor="end" class="muted mono">${label(t)}</text>`;
  out += `<line x1="${px0}" x2="${gRight}" y1="${aBottom}" y2="${aBottom}" stroke="#34445c"/>`;
  bars.forEach((b,k) => {
    const future = k+1 > i, tot = b.builtHa || 0, add = b.addHa || 0, x0 = xAt(k).toFixed(1), op = future ? .3 : 1;
    out += `<rect x="${x0}" y="${ya(tot-add).toFixed(1)}" width="${barW.toFixed(1)}" height="${(aBottom-ya(tot-add)).toFixed(1)}" fill="${baseRgb}" opacity="${op}"/>`;
    out += `<rect x="${x0}" y="${ya(tot).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,ya(tot-add)-ya(tot)).toFixed(1)}" fill="rgb(${palette[k+1].join(',')})" opacity="${op}"/>`;
    out += vlabel(cxAt(k),(ya(tot)-3).toFixed(1),label(tot),labelSize,` style="fill:#aab6c6" opacity="${future ? .4 : 1}"`);
  });
  // Panel B: the addition of each year on its own scale, with mean, median and peak.
  const amax = niceMax(Math.max(...bars.map(b => b.addHa || 0),1e-6)*1.3);
  const yb = v => bBottom-v/amax*(bBottom-bTop);
  out += `<text x="${gx}" y="${bTop-14}" font-size="9" font-weight="700">Shtesa e çdo viti (ha)</text>`;
  for (const t of [amax/2,amax]) out += `<line x1="${px0}" x2="${gRight}" y1="${yb(t)}" y2="${yb(t)}" stroke="#1e2a3a"/><text x="${px0-4}" y="${yb(t)+3}" font-size="7.5" text-anchor="end" class="muted mono">${label(t)}</text>`;
  out += `<line x1="${px0}" x2="${gRight}" y1="${bBottom}" y2="${bBottom}" stroke="#34445c"/>`;
  bars.forEach((b,k) => {
    const future = k+1 > i, v = b.addHa || 0, isPeak = b === peak && i > 1;
    out += `<rect x="${xAt(k).toFixed(1)}" y="${yb(v).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(v > 0 ? 1 : 0,bBottom-yb(v)).toFixed(1)}" rx="1" fill="rgb(${palette[k+1].join(',')})" opacity="${future ? .3 : 1}"${isPeak ? ' stroke="#fff" stroke-width="1.2"' : ''}/>`;
    out += vlabel(cxAt(k),(yb(v)-3).toFixed(1),(isPeak ? '▲ ' : '+')+label(v),labelSize,`${isPeak ? ' font-weight="700"' : ''} opacity="${future ? .4 : 1}"`);
    out += `<text x="${cxAt(k)}" y="${bBottom+6}" font-size="${Math.min(8.5,Number(labelSize)+1).toFixed(1)}" class="muted mono" text-anchor="end" dominant-baseline="middle" transform="rotate(-90 ${cxAt(k)} ${bBottom+6})">${xml(b.short)}</text>`;
  });
  if (zi.add) {
    // Guides across the panel; their key sits in the panel's title row so no value label is covered.
    const guide = (v,dash) => `<line x1="${px0}" x2="${gRight}" y1="${yb(v).toFixed(1)}" y2="${yb(v).toFixed(1)}" stroke="#66e0d1" stroke-dasharray="${dash}" opacity=".85"/>`;
    out += guide(zi.add.mean,'5 3')+guide(zi.add.median,'1.5 2.5');
    const kx = px0, ky = bBottom+46;
    out += `<line x1="${kx}" x2="${kx+16}" y1="${ky-3}" y2="${ky-3}" stroke="#66e0d1" stroke-dasharray="5 3"/><text x="${kx+20}" y="${ky}" font-size="8" class="accent">${xml('mesatarja '+label(zi.add.mean)+' ha')}</text>`+
      `<line x1="${kx+112}" x2="${kx+128}" y1="${ky-3}" y2="${ky-3}" stroke="#66e0d1" stroke-dasharray="1.5 2.5"/><text x="${kx+132}" y="${ky}" font-size="8" class="accent">${xml('mediana '+label(zi.add.median)+' ha')}</text>`;
  }
  // Authorship and sources across the bottom of the panel.
  y = H-62;
  out += `<line x1="${ax}" x2="${bRight}" y1="${y}" y2="${y}" stroke="#263244"/>`;
  text(`Autori: ${AUTHOR}`,12.5,'',700,22);
  text('Të dhënat: DLR World Settlement Footprint (Evolution, Tracker) · Kufijtë: KOSOVAREF01'+(state.basemap ? ' · '+BASEMAP_CREDIT[state.basemapSource].text : ''),8.5,'muted',400,16);
  text(`Kuartilet me interpolim linear; devijimi standard i mostrës; modusi mbi vlerat e rrumbullakosura në 0,1 · ${(d => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`)(new Date())}`,8,'muted',400,12);
  return {svg:out+'</svg>',width:W,height:H};
}
let viewerDownloads = null;
if (window.claude?.use) window.claude.use('downloads').then(d => { viewerDownloads = d; }).catch(() => {});
async function download(blob,name) {
  if (viewerDownloads) {
    try { await viewerDownloads.save({filename:name,data:blob});return; }
    catch (error) { if (error?.code === 'declined') return;alertExport('Shkarkimi nuk u lejua këtu: '+(error?.message || error?.code || ''));return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href);a.remove(); },1500);
}
const exportName = ext => `atlasi-urban-${normalize(state.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'pamja'}-${period().steps[state.index].short}.${ext}`;
async function exportView(kind) {
  try {
    const {svg,width,height} = exportSvg();
    if (kind === 'svg') return download(new Blob([svg],{type:'image/svg+xml'}),exportName('svg'));
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    await new Promise((resolve,reject) => { image.onload = resolve;image.onerror = () => reject(new Error('Imazhi nuk u krijua.'));image.src = url; });
    const scale = 2, out = document.createElement('canvas');
    out.width = width*scale;out.height = height*scale;
    const ctx = out.getContext('2d');
    ctx.scale(scale,scale);
    ctx.drawImage(image,0,0,width,height);
    URL.revokeObjectURL(url);
    out.toBlob(blob => blob ? download(blob,exportName('png')) : alertExport('PNG nuk u krijua; provoni SVG.'),'image/png');
  } catch (error) { alertExport(error.message); }
}
function alertExport(message) {
  $('status').hidden = false;
  $('status').textContent = message;
  setTimeout(() => { if (sample) $('status').hidden = true; },4000);
}
document.addEventListener('click',event => {
  const b = event.target.closest('[data-export]');
  if (!b) return;
  exportView(b.dataset.export);
});
window.atlasExport = exportSvg;   // for testing from the console
start();
// ---------- Sustainability: SDG 11.3.1 (land consumption vs population growth) ----------
// Population is known per municipality only (census 2011 and 2024). Land uses WSF Tracker, Jan 2017 → Jan 2024.
const SDG_CAT = {
  eff:{c:'#3987e5',t:'Rritje efikase',d:'Popullsia rritet më shpejt se zona e ndërtuar.'},
  spr:{c:'#c98500',t:'Shpërndarje',d:'Zona e ndërtuar rritet më shpejt se popullsia.'},
  dec:{c:'#d55181',t:'Zgjerim me popullsi në rënie',d:'Popullsia bie, ndërsa zona e ndërtuar rritet.'},
  na:{c:'#5b6675',t:'Të dhëna të pasigurta',d:'Popullsia në veri është vlerësim, jo regjistrim.'}
};
const SDG_T0 = 2017, SDG_T1 = 2024;
let population = null, popSource = null;
// Population at time t from five-yearly epochs: log-linear between the two nearest epochs.
function popAt(values,years,t) {
  let k = years.findIndex(y => y >= t);
  if (k <= 0) k = k === 0 ? 1 : years.length-1;
  const [y0,y1,a,b] = [years[k-1],years[k],values[k-1],values[k]];
  return a > 0 && b > 0 ? a*Math.pow(b/a,(t-y0)/(y1-y0)) : a+(b-a)*(t-y0)/(y1-y0);
}
// The population period: census years as counted, or the land period (2017–2024) read off GHS-POP.
function popPeriod() {
  const src = population.sources[popSource];
  if (popSource === 'census') {
    const d = (src.dates || []).map(x => new Date(x));
    return {y0:src.years[0],y1:src.years[1],years:d.length === 2 ? (d[1]-d[0])/(365.25*864e5) : src.years[1]-src.years[0],src};
  }
  return {y0:SDG_T0,y1:SDG_T1,years:SDG_T1-SDG_T0,src};
}
function unitPop(u) {
  const row = population.municipalities[u.id] || {}, P = popPeriod();
  if (popSource === 'census') return row.census ? [row.census[0],row.census[1]] : null;
  return row.ghspop ? [popAt(row.ghspop,P.src.years,SDG_T0),popAt(row.ghspop,P.src.years,SDG_T1)] : null;
}
function sdgMetrics(list,name) {
  const t = manifest.periods.tracker.steps, jan = y => t.findIndex(s => s.year === y && !/^Korrik/.test(s.label));
  const i0 = jan(SDG_T0) >= 0 ? jan(SDG_T0) : 1, i1 = jan(SDG_T1) >= 0 ? jan(SDG_T1) : t.length-1, P = popPeriod();
  const r = {name,list,estimate:popSource === 'census' && list.some(u => u.pop.estimate),areaKm2:0,p11:0,p24:0,b17:0,b24:0};
  for (const u of list) { const v = unitPop(u);r.areaKm2 += u.areaKm2;r.p11 += v[0];r.p24 += v[1];r.b17 += u.tracker[i0];r.b24 += u.tracker[i1]; }
  r.pgr = Math.log(r.p24/r.p11)/P.years*100;
  r.lcr = Math.log(r.b24/r.b17)/(t[i1].year-t[i0].year)*100;
  r.ratio = r.pgr > 0 ? r.lcr/r.pgr : null;
  r.m2pc = r.b24*1e6/r.p24;r.dpop = r.p24-r.p11;r.dha = (r.b24-r.b17)*100;
  r.cat = list.length === 1 && r.estimate ? 'na' : r.pgr <= 0 ? 'dec' : r.lcr > r.pgr ? 'spr' : 'eff';
  if (!(r.b17 > 0) || !(r.p11 > 0) || !(r.p24 > 0)) {
    Object.assign(r,{cat:'na',ratio:null,reason:'Pa zonë të ndërtuar ose pa popullsi në vitin bazë: shpejtësitë nuk llogariten.'});
    if (!(r.b17 > 0)) r.lcr = null;
    if (!(r.p11 > 0) || !(r.p24 > 0)) r.pgr = null;
  }
  return r;
}
let sdgCache = null;
function sdgAll() {
  if (sdgCache) return sdgCache;
  const ms = units.municipalities.filter(u => u.pop && unitPop(u));
  const rows = ms.map(u => Object.assign(sdgMetrics([u],u.name),{id:u.id,unit:u}));
  const kosovo = sdgMetrics(ms.filter(u => popSource !== 'census' || !u.pop.estimate),C.name);
  kosovo.count = ms.filter(u => popSource !== 'census' || !u.pop.estimate).length;kosovo.excluded = ms.length-kosovo.count;
  return sdgCache = {rows,kosovo,byId:new Map(rows.map(r => [r.id,r]))};
}
const sgn = (v,d=1) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '')+new Intl.NumberFormat('sq',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Math.abs(v));
const int = v => new Intl.NumberFormat('sq',{maximumFractionDigits:0}).format(v);
const dec = (v,d) => new Intl.NumberFormat('sq',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const hatch = id => `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#3a4350"/><line x1="0" y1="0" x2="0" y2="6" stroke="#6b7685" stroke-width="2"/></pattern>`;
function sdgFocus() {
  const {kosovo} = sdgAll(), ms = pickedMunicipalities().filter(u => u.pop && unitPop(u));
  if (!ms.length) return kosovo;
  return Object.assign(sdgMetrics(ms,ms.length === 1 ? ms[0].name : filterLabel(ms)),{ids:new Set(ms.map(u => u.id))});
}
function sdgTipHtml(r) {
  return `<b>${esc(r.name)}</b> <span style="color:${SDG_CAT[r.cat].c}">· ${SDG_CAT[r.cat].t}</span><br>Popullsia ${popPeriod().y0}–${popPeriod().y1}: ${int(r.p11)} → ${int(r.p24)} (${sgn(r.pgr,2)} %/vit)<br>Zona e ndërtuar: ${sgn(r.dha,0)} ha (${sgn(r.lcr,2)} %/vit)<br>SDG 11.3.1: <b>${r.ratio == null ? '—' : dec(r.ratio,2)}</b> · ${int(r.m2pc)} m²/banor${r.estimate ? '<br><small>popullsia e vlerësuar</small>' : ''}`;
}
function renderSdg() {
  if (!units || !population) return;
  const {rows,kosovo} = sdgAll(), f = sdgFocus(), c = SDG_CAT[f.cat], picked = f !== kosovo, P = popPeriod();
  const srcSel = $('sdgSource'), keys = Object.keys(population.sources);
  srcSel.innerHTML = keys.map(k => `<option value="${k}">${esc(population.sources[k].label)}${k === 'census' ? ' '+population.sources[k].years.join('–') : ` · ${SDG_T0}–${SDG_T1}`}</option>`).join('');
  srcSel.value = popSource;$('sdgSourceBox').hidden = keys.length < 2;
  $('sdgSourceNote').textContent = P.src.note || '';
  $('sdgFormula').innerHTML = `LCR = ln(T<sub>${SDG_T1}</sub>/T<sub>${SDG_T0}</sub>) / ${SDG_T1-SDG_T0} · PGR = ln(P<sub>${P.y1}</sub>/P<sub>${P.y0}</sub>) / ${Math.round(P.years)} · LCRPGR = LCR / PGR`;
  $('sdgPopNote').innerHTML = popSource === 'census'
    ? `<b>P</b>: popullsia rezidente sipas regjistrimeve ${P.y0} dhe ${P.y1}. ${esc(P.src.source || '')}`
    : `<b>P</b>: popullsia sipas GHS-POP R2023A, e interpoluar në ${SDG_T0} dhe ${SDG_T1} nga epokat ${P.src.years.join(', ')}. ${esc(P.src.note || '')}`;
  $('sdgEstimateNote').hidden = !kosovo.excluded;
  $('sdgScatterNote').textContent = `rritja vjetore · popullsia ${P.y0}–${P.y1}, zona e ndërtuar ${SDG_T0}–${SDG_T1}`;
  $('sdgBarsNote').textContent = `m² sipas WSF Tracker · vija = ${C.name}`;
  // Verdict and scope
  $('sdgStory').innerHTML = f.cat === 'na' ? `<b>${esc(f.name)}</b>: ${f.reason || c.d}`
    : f.cat === 'dec' ? `<b>${esc(f.name)}</b>: popullsia ra <b>${int(-f.dpop)}</b> banorë nga ${P.y0}, por u shtuan <b>${int(f.dha)} ha</b> zonë e ndërtuar nga 2017.`
    : f.pgr < .25 && f.lcr > f.pgr ? `<b>${esc(f.name)}</b>: popullsia është pothuajse e pandryshuar (${sgn(f.pgr,2)} %/vit), ndërsa zona e ndërtuar rritet ${sgn(f.lcr,2)} %/vit. Raporti del shumë i lartë sepse pjesëtohet me një numër afër zeros.`
    : f.ratio > 1 ? `<b>${esc(f.name)}</b>: toka konsumohet <b>${dec(f.ratio,1)} herë</b> më shpejt se rritet popullsia.`
    : `<b>${esc(f.name)}</b>: popullsia rritet më shpejt se toka e ndërtuar (raporti <b>${dec(f.ratio,2)}</b>).`;
  $('sdgPill').innerHTML = `<i style="background:${c.c}"></i>${c.t}`;
  $('sdgPill').style.cssText = `color:${c.c};border-color:${c.c}`;
  $('sdgScope').innerHTML = (picked ? `Filtri: ${f.list.length} ${f.list.length === 1 ? C.unit1.one : C.unit1.many} si një e tërë${f.estimate ? ' · <b>përfshin popullsi të vlerësuar</b>' : ''}` : `${esc(C.whole)}: ${kosovo.count} ${esc(C.unit1.many)}${kosovo.excluded ? `, pa ${kosovo.excluded} me popullsi të vlerësuar` : ''} · zgjidh ${esc(C.unit1.many)} në hartë ose te "Njësitë"`)
    + (ZONE.size ? ` · ${esc(C.unit2.Many)} nuk kanë popullsi, ndaj tregohen ${esc(C.unit1.the)} e tyre` : '')
    + (state.radial && !picked ? ' · rrethi radial nuk përdoret këtu' : '');
  $('sdgKpis').innerHTML = `
    <div><span>Popullsia ${P.y1}${popSource === 'census' ? '' : ' (e modeluar)'}</span><strong>${int(f.p24)}</strong><em>${sgn(f.dpop,0)} nga ${P.y0} (${sgn((f.p24/f.p11-1)*100)} %)</em></div>
    <div><span>Zona e ndërtuar, janar 2024</span><strong>${int(f.b24*100)} ha</strong><em>${sgn(f.dha,0)} ha nga 2017 (${sgn((f.b24/f.b17-1)*100)} %)</em></div>
    <div><span>Zonë e ndërtuar për banor</span><strong>${int(f.m2pc)} m²</strong><em>${picked ? `${esc(C.name)}: ${int(kosovo.m2pc)} m²` : 'mesatarja e territorit'}</em></div>
    <div class="sdg-k"><span>SDG 11.3.1 · LCRPGR</span><strong style="color:${c.c}">${f.ratio == null ? '—' : dec(f.ratio,2)}</strong><em>toka ${sgn(f.lcr,2)} %/vit · popullsia ${sgn(f.pgr,2)} %/vit</em></div>`;
  renderSdgMap(rows,f);
  renderSdgScatter(rows,kosovo,f);
  renderSdgBars(rows,kosovo,f);
  renderSdgCards(f);
  renderSoil();
}
function renderSdgMap(rows,f) {
  const host = $('sdgMap');
  if (!host.firstChild) {
    host.innerHTML = choroSvg('municipalities');
    host.querySelector('svg').insertAdjacentHTML('afterbegin',`<defs>${hatch('sdgHatch')}</defs>`);
    const tip = host.querySelector('.chart-tip'), svg = host.querySelector('svg');
    svg.onpointermove = event => {
      const r = sdgAll().byId.get(event.target.dataset?.id);
      if (!r) { tip.hidden = true;return; }
      const b = host.getBoundingClientRect();
      tip.hidden = false;tip.innerHTML = sdgTipHtml(r);
      tip.style.left = Math.max(110,Math.min(b.width-110,event.clientX-b.left))+'px';tip.style.top = (event.clientY-b.top-10)+'px';
    };
    svg.onpointerleave = () => { tip.hidden = true; };
    svg.onclick = event => { const u = units.byId.municipalities.get(event.target.dataset?.id);if (u) toggleUnit(u); };
  }
  const svg = host.querySelector('svg');
  svg.style.setProperty('--z','1');
  svg.classList.toggle('has-sel',MUN.size > 0);
  for (const el of host.querySelectorAll('[data-mid]')) el.classList.toggle('on',MUN.has(el.dataset.mid));
  for (const el of host.querySelectorAll('path.u')) {
    const r = sdgAll().byId.get(el.dataset.id);
    el.style.fill = !r ? '#2a3240' : r.cat === 'na' ? 'url(#sdgHatch)' : SDG_CAT[r.cat].c;
    el.classList.toggle('sel',MUN.has(el.dataset.id));
    el.classList.toggle('dim',false);
  }
  const n = {};for (const r of rows) n[r.cat] = (n[r.cat] || 0)+1;
  $('sdgLegend').innerHTML = ['eff','spr','dec','na'].map(k => `<span><i style="background:${k === 'na' ? 'repeating-linear-gradient(45deg,#3a4350 0 3px,#6b7685 3px 5px)' : SDG_CAT[k].c}"></i>${SDG_CAT[k].t} · ${n[k] || 0}</span>`).join('');
}
function sdgHover(host,el,r) {
  const tip = host.querySelector('.chart-tip');
  el.addEventListener('pointermove',event => {
    const b = host.getBoundingClientRect();
    tip.hidden = false;tip.innerHTML = sdgTipHtml(r);
    tip.style.left = Math.max(110,Math.min(b.width-110,event.clientX-b.left))+'px';tip.style.top = (event.clientY-b.top-10)+'px';
  });
  el.addEventListener('pointerleave',() => { tip.hidden = true; });
  if (r.unit) el.addEventListener('click',() => toggleUnit(r.unit));
}
function renderSdgScatter(rows,kosovo,f) {
  const host = $('sdgScatter'), W = Math.max(300,host.clientWidth || 480), H = 300, m = {l:40,r:12,t:12,b:34};
  const pts = rows.filter(r => !r.estimate && r.lcr != null && r.pgr != null), sel = f.ids || new Set();
  const x0 = Math.floor(Math.min(-1,...pts.map(r => r.pgr))), x1 = Math.ceil(Math.max(1,...pts.map(r => r.pgr)));
  const y1 = Math.ceil(Math.max(...pts.map(r => r.lcr))+.3);
  const X = v => m.l+(v-x0)/(x1-x0)*(W-m.l-m.r), Y = v => m.t+(1-v/y1)*(H-m.t-m.b);
  const dEnd = Math.min(x1,y1);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  s += `<rect x="${m.l}" y="${m.t}" width="${X(0)-m.l}" height="${H-m.t-m.b}" fill="#d55181" opacity=".07"/>`;
  s += `<polygon points="${X(0)},${Y(0)} ${X(0)},${Y(y1)} ${X(dEnd)},${Y(y1)} ${X(dEnd)},${Y(dEnd)}" fill="#c98500" opacity=".07"/>`;
  for (let v = x0;v <= x1;v++) s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H-m.b}"/><text x="${X(v)}" y="${H-m.b+12}" text-anchor="middle">${v > 0 ? '+' : ''}${v}%</text>`;
  for (let v = 0;v <= y1;v++) s += `<line class="grid" y1="${Y(v)}" y2="${Y(v)}" x1="${m.l}" x2="${W-m.r}"/><text x="${m.l-5}" y="${Y(v)+3}" text-anchor="end">+${v}%</text>`;
  s += `<line class="axis" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${H-m.b}"/>`;
  s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(dEnd)}" y2="${Y(dEnd)}" stroke="#b4c0cd" stroke-dasharray="4 3"/><text x="${X(dEnd*.6)+6}" y="${Y(dEnd*.6)+3}" style="fill:#b4c0cd">raporti = 1</text>`;
  s += `<text x="${m.l+5}" y="${m.t+11}" style="fill:#d55181;font-weight:700">popullsia bie, toka rritet</text><text x="${X(0)+5}" y="${m.t+11}" style="fill:#c98500;font-weight:700">shpërndarje</text><text x="${W-m.r-4}" y="${H-m.b-6}" text-anchor="end" style="fill:#3987e5;font-weight:700">efikase</text>`;
  s += `<text x="${(m.l+W-m.r)/2}" y="${H-4}" text-anchor="middle">popullsia, %/vit (${popPeriod().y0}–${popPeriod().y1}) →</text><text transform="translate(9 ${(m.t+H-m.b)/2}) rotate(-90)" text-anchor="middle">toka e ndërtuar, %/vit (2017–2024) →</text></svg><div class="chart-tip" hidden></div>`;
  host.innerHTML = s;
  const svg = host.querySelector('svg'), NS = 'http://www.w3.org/2000/svg';
  for (const r of [...pts].sort((a,b) => sel.has(a.id)-sel.has(b.id))) {
    const on = sel.has(r.id), el = document.createElementNS(NS,'circle');
    el.setAttribute('cx',X(r.pgr));el.setAttribute('cy',Y(r.lcr));el.setAttribute('r',on ? 6.5 : Math.max(3.5,Math.sqrt(r.p24)/75));
    el.setAttribute('fill',SDG_CAT[r.cat].c);el.setAttribute('fill-opacity',sel.size && !on ? .3 : .9);
    el.setAttribute('stroke',on ? '#fff' : '#090d15');el.setAttribute('stroke-width',on ? 2 : 1.5);el.style.cursor = 'pointer';
    sdgHover(host,el,r);svg.appendChild(el);
  }
  const g = document.createElementNS(NS,'g'), kx = X(kosovo.pgr), ky = Y(kosovo.lcr);
  g.innerHTML = `<rect x="${kx-5}" y="${ky-5}" width="10" height="10" transform="rotate(45 ${kx} ${ky})" fill="#e8eef6" stroke="#090d15" stroke-width="1.5"/><text x="${kx+9}" y="${ky+3}" style="fill:#e8eef6;font-weight:700">${esc(C.name)}</text>`;
  sdgHover(host,g,kosovo);svg.appendChild(g);
  if (f.ids && f.list.length > 1) {
    const fx = X(f.pgr), fy = Y(f.lcr), a = document.createElementNS(NS,'g');
    a.innerHTML = `<circle cx="${fx}" cy="${fy}" r="7" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 2"/><text x="${fx+10}" y="${fy+16}" style="fill:#fff;font-weight:700">përzgjedhja</text>`;
    sdgHover(host,a,f);svg.appendChild(a);
  }
  const labels = new Set([...pts].sort((a,b) => b.p24-a.p24).slice(0,3).map(r => r.id).concat([...sel]));
  for (const r of pts) if (labels.has(r.id)) {
    const t = document.createElementNS(NS,'text');
    t.setAttribute('x',X(r.pgr)+8);t.setAttribute('y',Y(r.lcr)-6);t.textContent = r.name;
    if (sel.has(r.id)) t.style.cssText = 'fill:#fff;font-weight:700';
    svg.appendChild(t);
  }
}
function renderSdgBars(rows,kosovo,f) {
  const host = $('sdgBars'), W = Math.max(300,host.clientWidth || 480), rh = 12, ml = 112, mr = 34, sorted = [...rows].sort((a,b) => b.m2pc-a.m2pc);
  const H = sorted.length*rh+20, max = Math.max(...sorted.map(r => r.m2pc)), X = v => ml+v/max*(W-ml-mr), sel = f.ids || new Set();
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${hatch('sdgHatch2')}</defs>`;
  for (let v = 0;v <= max;v += 200) s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="0" y2="${H-16}"/><text x="${X(v)}" y="${H-4}" text-anchor="middle">${v}</text>`;
  s += `</svg><div class="chart-tip" hidden></div>`;
  host.innerHTML = s;
  const svg = host.querySelector('svg'), NS = 'http://www.w3.org/2000/svg';
  sorted.forEach((r,i) => {
    const y = i*rh, on = sel.has(r.id), g = document.createElementNS(NS,'g');
    g.style.cursor = 'pointer';
    g.innerHTML = `<rect x="0" y="${y}" width="${W}" height="${rh}" fill="${on ? '#16303a' : 'transparent'}"/><text x="${ml-6}" y="${y+rh/2+3}" text-anchor="end" style="${on ? 'fill:#fff;font-weight:700' : ''}">${esc(r.name)}</text>
      <rect x="${ml}" y="${y+2}" width="${Math.max(1,X(r.m2pc)-ml)}" height="${rh-4}" rx="1.5" fill="${r.cat === 'na' ? 'url(#sdgHatch2)' : SDG_CAT[r.cat].c}" opacity="${sel.size && !on ? .4 : 1}"/>
      <text x="${X(r.m2pc)+4}" y="${y+rh/2+3}" style="${on ? 'fill:#fff' : ''}">${int(r.m2pc)}</text>`;
    sdgHover(host,g,r);svg.appendChild(g);
  });
  const k = document.createElementNS(NS,'g');
  k.innerHTML = `<line x1="${X(kosovo.m2pc)}" x2="${X(kosovo.m2pc)}" y1="0" y2="${H-16}" stroke="#e8eef6" stroke-dasharray="3 3"/><text x="${X(kosovo.m2pc)+4}" y="${H-18}" style="fill:#e8eef6">${esc(C.name)} ${int(kosovo.m2pc)} m²</text>`;
  svg.appendChild(k);
}
// ---------- Land cover under new construction (Esri 10m annual land cover) ----------
let landcover = null;
const haFmt = v => int(v)+' ha';
const pct1 = v => isFinite(v) ? dec(v*100,1)+' %' : '—';
const add2 = (a,b) => a.map((row,i) => row.map((v,k) => v+b[i][k]));
function lcSum(rows) {
  const out = {cover:landcover.years.map(() => landcover.classes.map(() => 0)),newBuilt:landcover.steps.map(() => landcover.classes.map(() => 0)),urban:0,green:0};
  for (const r of rows) if (r) { out.cover = add2(out.cover,r.cover);out.newBuilt = add2(out.newBuilt,r.newBuilt);out.urban += r.urban;out.green += r.green; }
  return out;
}
// Same scope as the map filter: picked zones, else picked level-1 units, else the whole country.
function lcFocus() {
  const list = filterUnits();
  const L = !list.length ? Object.assign({name:C.name,whole:true},landcover.national) : Object.assign({name:filterLabel(list),whole:false},lcSum(list.map(u => landcover[u.level]?.[u.id])));
  L.total = landcover.classes.map((_,k) => L.newBuilt.reduce((a,row) => a+row[k],0));
  return L;
}
const lcIndex = key => landcover.classes.findIndex(c => c.key === key);
function lcBar(total) {
  const sum = total.reduce((a,b) => a+b,0);
  if (!sum) return '<div class="lc-bar empty"><span style="flex:1"></span></div>';
  return `<div class="lc-bar">${landcover.classes.map((c,i) => total[i] > 0 ? `<span style="flex:${total[i]};background:${c.color}" title="${esc(c.label)}: ${haFmt(total[i])} (${pct1(total[i]/sum)})"></span>` : '').join('')}</div>`;
}
// Stacked bars: what each Tracker step's new construction replaced, by class.
function lcYearChart(L) {
  const st = landcover.steps, W = Math.max(300,$('sdgCards').clientWidth || 480), H = 190, m = {l:44,r:8,t:10,b:40};
  const sums = L.newBuilt.map(r => r.reduce((a,b) => a+b,0)), max = Math.max(1,...sums);
  const step = (W-m.l-m.r)/st.length, bw = Math.min(26,step*.66), Y = v => m.t+(1-v/max)*(H-m.t-m.b);
  const nice = [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000].find(v => max/v <= 4) || max/4;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="lc-years">`;
  for (let v = 0;v <= max;v += nice) svg += `<line class="grid" x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l-5}" y="${Y(v)+3}" text-anchor="end">${int(v)}</text>`;
  st.forEach((s,i) => {
    const x = m.l+i*step+(step-bw)/2;
    let y = H-m.b;
    landcover.classes.forEach((c,k) => {
      const v = L.newBuilt[i][k];
      if (v <= 0) return;
      const h = Math.max(0,(H-m.t-m.b)*v/max);
      y -= h;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${c.color}" opacity="${s.exact ? 1 : .5}"><title>${esc(s.label)} · ${esc(c.label)}: ${haFmt(v)}</title></rect>`;
    });
    svg += `<text x="${x+bw/2}" y="${H-m.b+12}" text-anchor="middle">${String(s.label).replace(/^(Janar|Korrik) /,'').replace(/^20/,'’')}${s.label.startsWith('Korrik') ? '·VII' : ''}${s.exact ? '' : '*'}</text>`;
  });
  svg += `<text x="${m.l}" y="${H-6}">ha të ndërtuara në hapin e Tracker, sipas mbulesës një vit para ndërtimit</text></svg>`;
  return svg;
}
function soilCardText() {
  if (!soil) return '';
  const S = soilFocus(), b = soil.best, best = rows => rows.reduce((a,r) => a+r.slice(0,b).reduce((x,y) => x+y,0),0);
  return ` Në tokë të klasave I–IV u ndërtuan <b>${haFmt(best(S.evolution.slice(1)))}</b> në 1986–2015 dhe <b>${haFmt(best(S.tracker.slice(1)))}</b> pas korrikut 2016.`;
}
function renderSdgCards(f) {
  const L = landcover ? lcFocus() : null;
  let cards;
  if (L) {
    const fo = lcIndex('forest'), cr = lcIndex('crop'), ys = landcover.years, Y0 = ys[0], Y1 = ys[ys.length-1];
    const land = row => row.reduce((a,b) => a+b,0), sum = L.total.reduce((a,b) => a+b,0);
    const sh0 = L.cover[0][fo]/land(L.cover[0]), sh1 = L.cover.at(-1)[fo]/land(L.cover.at(-1));
    const per = `${landcover.steps[0].label.replace(/^(Janar|Korrik) /,'')}–${landcover.steps.at(-1).label.replace(/^(Janar|Korrik) /,'')}`;
    const pp = (sh1-sh0)*100;
    cards = [
      ['15.1.1','Pyjet',`Pyjet zënë <b>${pct1(sh1)}</b> të territorit në ${Y1} (${pp >= 0 ? '+' : '−'}${dec(Math.abs(pp),1)} pikë nga ${Y0}). Ndërtimet e ${per} zunë <b>${haFmt(L.total[fo])}</b> pyje.`,true],
      ['2.4.1 · 15.3.1','Toka bujqësore',`<b>${haFmt(L.total[cr])}</b> tokë bujqësore u mbulua me ndërtime në ${per}: ${pct1(sum ? L.total[cr]/sum : NaN)} e ndërtimeve të reja. Toka e mbuluar humbet përgjithmonë.${soilCardText()}`,true],
      ['11.7.1','Gjelbërimi urban',`<b>${pct1(L.green/L.urban)}</b> e zonës urbane (deri në ${landcover.urbanBufferM} m nga ndërtimet) është pyll, kullotë ose shkurre (${Y1}). Tregues i përafërt: nuk dallon hapësirën publike.`,true]
    ];
  } else cards = [
    ['15.1.1','Pyjet','Pyje të kthyera në zonë të ndërtuar, viti pas viti. Burimi: Esri 10m Land Cover.',false],
    soil ? ['2.4.1 · 15.3.1','Toka bujqësore',`Ndërtime mbi tokë bujqësore sipas klasave të përshtatshmërisë.${soilCardText()}`,true] : ['2.4.1 · 15.3.1','Toka bujqësore','Toka bujqësore e mbuluar përgjithmonë. Burimi: Esri 10m Land Cover.',false],
    ['11.7.1','Gjelbërimi urban','Gjelbërimi brenda zonës urbane. Burimi: Esri 10m Land Cover.',false]
  ];
  $('sdgCards').innerHTML = [['11.3.1','Toka kundrejt popullsisë',f.ratio == null ? `${SDG_CAT[f.cat].t}: toka ${sgn(f.lcr,2)} %/vit, popullsia ${sgn(f.pgr,2)} %/vit.` : `LCRPGR = ${dec(f.ratio,2)}. ${SDG_CAT[f.cat].d}`,true],...cards]
    .map(([n,h,t,on]) => `<div><b>SDG ${n}</b><strong>${h}</strong><span>${t}</span><em class="${on ? 'live' : 'todo'}">${on ? 'LLOGARITUR' : 'KËRKON TË DHËNA'}</em></div>`).join('');
  $('sdgLandState').textContent = L ? `Esri 10m Land Cover · ${landcover.years[0]}–${landcover.years.at(-1)}` : 'pa të dhëna ende';
  if (L && !$('sdgLandBox').dataset.touched) $('sdgLandBox').open = true;
  if (!L) {
    $('sdgLand').innerHTML = `<p class="note">Kjo pjesë aktivizohet pasi të ndërtohet <code>landcover.json</code> nga harta vjetore e mbulesës së tokës (Esri / Impact Observatory): në GitHub, <i>Actions → Build land cover → Run workflow</i>.</p>`;
    return;
  }
  const N = landcover.national, Ntot = landcover.classes.map((_,k) => N.newBuilt.reduce((a,row) => a+row[k],0));
  const sum = L.total.reduce((a,b) => a+b,0), nSum = Ntot.reduce((a,b) => a+b,0);
  const ranked = landcover.classes.map((c,i) => ({c,v:L.total[i]})).filter(x => x.v > 0 && x.c.key !== 'built').sort((a,b) => b.v-a.v);
  const top = ranked.slice(0,2).map(x => `<b>${haFmt(x.v)}</b> ${x.c.label.toLowerCase()}`).join(' dhe ');
  const first = landcover.steps[0].label.toLowerCase(), last = landcover.steps.at(-1).label.toLowerCase();
  const inBuilt = L.total[lcIndex('built')] || 0;
  $('sdgLand').innerHTML = `<p class="story-small"><b>${esc(L.name)}</b>: nga korriku 2016 deri në ${last} u shtuan <b>${haFmt(sum)}</b> zonë e ndërtuar. <b>${pct1(sum ? inBuilt/sum : NaN)}</b> u ndërtua brenda vendbanimeve ekzistuese (mbushje e oborreve dhe e hapësirave të lira)${top ? `; jashtë tyre u zunë kryesisht ${top}` : ''}.</p>`
    + `<div class="chart lc-chart">${lcYearChart(L)}</div>`
    + `<div class="choro-legend">${landcover.classes.map(c => `<span><i style="background:${c.color}"></i>${esc(c.label)}</span>`).join('')}</div>`
    + `<div class="lc-row"><span>${esc(L.whole ? C.name : 'Përzgjedhja')}</span>${lcBar(L.total)}</div>`
    + (L.whole ? '' : `<div class="lc-row ref"><span>${esc(C.name)}</span>${lcBar(Ntot)}</div>`)
    + `<table class="lc-table"><thead><tr><th>Mbulesa para ndërtimit</th><th>ha</th><th>%</th>${L.whole ? '' : `<th>${esc(C.name)} %</th>`}</tr></thead><tbody>`
    + landcover.classes.map((c,i) => L.total[i] > 0 || (!L.whole && Ntot[i] > 0) ? `<tr><td><i style="background:${c.color}"></i>${esc(c.label)}</td><td>${int(L.total[i])}</td><td>${pct1(sum ? L.total[i]/sum : NaN)}</td>${L.whole ? '' : `<td>${pct1(Ntot[i]/nSum)}</td>`}</tr>` : '').join('')
    + `</tbody></table>`
    + `<p class="note">Çdo piksel që WSF Tracker e shton në një hap krahasohet me hartën vjetore të mbulesës së tokës të vitit para se të nisë ndërtimi (p.sh. ndërtimet deri në janar 2020 me hartën e 2018). Hapat me * nuk kanë hartë për vitin e duhur (seria mbulon ${landcover.years[0]}–${landcover.years.at(-1)}) dhe përdorin vitin më të afërt: për hapat e parë një pjesë del si "brenda vendbanimit ekzistues". Kjo klasë përfshin ndërtimet e reja në hapësira që harta e Esri i kishte tashmë pjesë të zonës së banuar (oborre, kopshte, parcela brenda fshatrave dhe qyteteve). Vitet e reja të hartës shtohen vetë në përditësimin mujor. ${esc(landcover.source)}.</p>`;
}
$('sdgLandBox').addEventListener('toggle',() => { $('sdgLandBox').dataset.touched = '1'; });

// ---------- Built-up area on agricultural land by suitability class (I–VIII) ----------
let soil = null;
function soilFocus() {
  const list = filterUnits();
  if (!list.length) return Object.assign({name:C.name,whole:true},soil.national);
  const rows = list.map(u => soil[u.level]?.[u.id]).filter(Boolean), out = {name:filterLabel(list),whole:false};
  const sum = key => rows.reduce((acc,r) => acc ? acc.map((v,i) => Array.isArray(v) ? v.map((x,k) => x+r[key][i][k]) : v+r[key][i]) : JSON.parse(JSON.stringify(r[key])),null);
  for (const key of ['area','evolution','tracker']) out[key] = sum(key);
  return out;
}
function soilChart(S,product) {
  const st = period(product).steps, rows = S[product].slice(1), W = Math.max(300,$('sdgCards').clientWidth || 480), H = 180, m = {l:44,r:8,t:10,b:34};
  const sums = rows.map(r => r.reduce((a,b) => a+b,0)), max = Math.max(1,...sums), step = (W-m.l-m.r)/rows.length, bw = Math.max(2,Math.min(22,step*.7));
  const Y = v => m.t+(1-v/max)*(H-m.t-m.b), nice = [1,2,5,10,20,50,100,200,500,1000,2000,5000].find(v => max/v <= 4) || max/4;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="lc-years">`;
  for (let v = 0;v <= max;v += nice) svg += `<line class="grid" x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l-5}" y="${Y(v)+3}" text-anchor="end">${int(v)}</text>`;
  const every = Math.ceil(rows.length/12);
  rows.forEach((r,i) => {
    const x = m.l+i*step+(step-bw)/2;let y = H-m.b;
    r.forEach((v,k) => { if (v <= 0) return;const h = (H-m.t-m.b)*v/max;y -= h;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${soil.colors[k]}"><title>${esc(st[i+1].label)} · klasa ${soil.labels[k]}: ${haFmt(v)}</title></rect>`; });
    if (i % every === 0 || i === rows.length-1) svg += `<text x="${x+bw/2}" y="${H-m.b+12}" text-anchor="middle">${String(st[i+1].short || st[i+1].label).replace(/^(Janar|Korrik) /,'')}</text>`;
  });
  return svg+`<text x="${m.l}" y="${H-4}">ha të shtuara në çdo hap, sipas klasës së tokës</text></svg>`;
}
function renderSoil() {
  const box = $('soilBox');
  box.hidden = !soil;
  if (!soil) return;
  const S = soilFocus(), product = state.period === 'tracker' ? 'tracker' : 'evolution', pe = period(product), best = soil.best;
  const add = rows => rows.reduce((acc,r) => acc.map((v,k) => v+r[k]),soil.labels.map(() => 0));
  const stock = S[product][0], added = add(S[product].slice(1)), built = stock.map((v,k) => v+added[k]);
  const tot = a => a.reduce((x,y) => x+y,0), bestOf = a => a.slice(0,best).reduce((x,y) => x+y,0);
  const first = pe.steps[0].label, last = pe.steps.at(-1).label;
  $('soilState').textContent = `${product === 'tracker' ? 'WSF Tracker' : 'WSF Evolution'} · ${first} → ${last}`;
  $('soilStory').innerHTML = `<b>${esc(S.name)}</b>: pas ${first.toLowerCase().replace(/^korrik/,'korrikut').replace(/^janar/,'janarit')} u ndërtuan <b>${haFmt(tot(added))}</b>, nga të cilat <b>${haFmt(bestOf(added))}</b> (${pct1(bestOf(added)/tot(added))}) në tokë të klasave I–IV, më të mirat për bujqësi. Deri në ${last.toLowerCase()} është ndërtuar <b>${pct1(bestOf(built)/bestOf(S.area))}</b> e tokës së klasave I–IV.`;
  $('soilChart').innerHTML = soilChart(S,product);
  $('soilLegend').innerHTML = soil.labels.map((l,k) => `<span><i style="background:${soil.colors[k]}"></i>${l}</span>`).join('')+'<span style="color:var(--muted)">I = më e përshtatshmja</span>';
  $('soilTable').innerHTML = `<thead><tr><th>Klasa</th><th>Sipërfaqja ha</th><th>E ndërtuar ${esc(last.replace(/^(Janar|Korrik) /,''))} ha</th><th>% e klasës</th><th>Shtuar ha</th></tr></thead><tbody>`
    + soil.labels.map((l,k) => `<tr${k < best ? ' class="best"' : ''}><td><i style="background:${soil.colors[k]}"></i>${l}</td><td>${int(S.area[k])}</td><td>${int(built[k])}</td><td>${pct1(built[k]/S.area[k])}</td><td>${int(added[k])}</td></tr>`).join('')
    + `<tr class="sum"><td>I–IV</td><td>${int(bestOf(S.area))}</td><td>${int(bestOf(built))}</td><td>${pct1(bestOf(built)/bestOf(S.area))}</td><td>${int(bestOf(added))}</td></tr></tbody>`;
  $('soilNote').textContent = `Grafiku ndjek periudhën e zgjedhur në panelin e majtë. WSF Evolution dhe WSF Tracker matin ndryshe, ndaj shifrat e tyre nuk mblidhen. Klasa e tokës merret nga rasteri 50 m në qendrën e çdo pikseli të ndërtuar; vlerat jashtë kufirit maskohen. ${soil.source}`;
}
function exportSdgCsv() {
  const {rows,kosovo} = sdgAll(), f = sdgFocus();
  const P = popPeriod();
  const head = ['njesia',`pop_${P.y0}`,`pop_${P.y1}`,'popullsia_pct_vit','ha_2017','ha_2024','toka_pct_vit','lcrpgr','m2_per_banor','kategoria','shenim'];
  const line = r => [r.name,r.p11,r.p24,r.pgr.toFixed(3),(r.b17*100).toFixed(1),(r.b24*100).toFixed(1),r.lcr.toFixed(3),r.ratio == null ? '' : r.ratio.toFixed(3),r.m2pc.toFixed(1),SDG_CAT[r.cat].t,r.estimate ? 'popullsi e vleresuar' : ''];
  const out = [head,line(kosovo)].concat(f !== kosovo && f.list.length > 1 ? [line(f)] : [],rows.map(line));
  download(new Blob(['﻿'+out.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')],{type:'text/csv'}),`${C.id.toLowerCase()}-sdg-11-3-1-${popSource}.csv`);
}
$('sdgCsv').onclick = exportSdgCsv;
$('sdgSource').onchange = () => { popSource = $('sdgSource').value;sdgCache = null;renderSdg(); };

const $ = id => document.getElementById(id);
// ---------- Language: Albanian (default) or English. Chosen by #l=en, then remembered. ----------
const LANG = (() => {
  const h = new URLSearchParams(location.hash.slice(1)).get('l');
  if (h === 'en' || h === 'sq') { try { localStorage.setItem('atlas-lang',h); } catch {} return h; }
  try { return localStorage.getItem('atlas-lang') === 'en' ? 'en' : 'sq'; } catch { return 'sq'; }
})();
const L = (sq,en) => LANG === 'en' ? en : sq;
const LOCALE = L('sq','en');
document.documentElement.lang = LANG;
const MONTH_EN = {janar:'January',korrik:'July'};
const trLabel = text => LANG === 'en' ? String(text).replace(/\b(janar|korrik)\b/gi,m => MONTH_EN[m.toLowerCase()]) : text;
const EPOCH_EN = {'GJENDJA FILLESTARE':'BASELINE','KORRIK · GJENDJA FILLESTARE':'JULY · BASELINE','JANAR':'JANUARY','KORRIK':'JULY'};
const trEpoch = text => LANG === 'en' ? (EPOCH_EN[text] ?? text) : text;
const yearOnly = text => String(text).replace(/^(Janar|Korrik|January|July) /,'');
// Texts that arrive inside the data files.
const EN_DATA = {
  'WSF TRACKER · 10 M NË BURIM':'WSF TRACKER · 10 M AT SOURCE',
  'Pyje':'Forest','Kullota dhe shkurre':'Grassland and shrubland','Tokë bujqësore':'Cropland','Brenda vendbanimit ekzistues':'Inside existing settlement','Tokë e zhveshur':'Bare ground','Ujë dhe ligatina':'Water and wetlands','Tjetër (borë, re)':'Other (snow, cloud)',
  'Regjistrimi':'Census',
  'Agjencia e Statistikave të Kosovës (ASK): Regjistrimi i popullsisë 2011; Regjistrimi 2024, rezultatet e para përfundimtare (Tab. 4.1, Tab. 5.1).':'Kosovo Agency of Statistics (KAS): 2011 Population Census; 2024 Census, first final results (Tab. 4.1, Tab. 5.1).',
  'Për Leposaviqin, Zubin Potokun, Zveçanin dhe Mitrovicën e Veriut të dy vitet janë vlerësime të ASK, sepse regjistrimet u bojkotuan.':'For Leposaviq, Zubin Potok, Zveçan and North Mitrovica both years are KAS estimates, because the censuses were boycotted.',
  'Përshtatshmëria e tokës bujqësore, klasat I–VIII (raster 50 m, EPSG:9141), dhënë nga autori.':'Agricultural land suitability, classes I–VIII (50 m raster, EPSG:9141), provided by the author.',
};
const tx = text => LANG === 'en' && text && EN_DATA[text] || text;
// Country and unit names in English; the data packs carry the Albanian ones.
const COUNTRY_EN = {
  XKX:{name:'Kosovo',in:'in Kosovo',of:'of Kosovo',whole:'All of Kosovo',show:'Show all of Kosovo',short:'KOSOVO',atlas:'Urban Atlas of Kosovo',
    unit1:{one:'municipality',many:'municipalities',One:'Municipality',Many:'Municipalities',the:'the municipalities',acc:'the municipality'},
    unit2:{one:'cadastral zone',many:'cadastral zones',One:'Cadastral zone',Many:'Cadastral zones',short:'CZ'},
    unitsNote:'Municipal and cadastral zone boundaries are in KOSOVAREF01 (EPSG:9141).'},
  ALB:{name:'Albania',in:'in Albania',of:'of Albania',whole:'All of Albania',show:'Show all of Albania',short:'ALBANIA',atlas:'Urban Atlas of Albania',
    unit1:{one:'municipality',many:'municipalities',One:'Municipality',Many:'Municipalities',the:'the municipalities',acc:'the municipality'},
    unit2:{one:'administrative unit',many:'administrative units',One:'Administrative unit',Many:'Administrative units',short:'AU'}},
  MKD:{name:'North Macedonia',in:'in North Macedonia',of:'of North Macedonia',whole:'All of North Macedonia',show:'Show all of North Macedonia',short:'N. MACEDONIA',atlas:'Urban Atlas of North Macedonia',
    unit1:{one:'municipality',many:'municipalities',One:'Municipality',Many:'Municipalities',the:'the municipalities',acc:'the municipality'},
    unit2:{one:'unit',many:'units',One:'Unit',Many:'Units',short:'U'}},
};
function countryText(c) {
  if (LANG !== 'en') return c;
  const en = COUNTRY_EN[c.id] || {name:c.name,in:'in '+c.name,of:'of '+c.name,whole:'All of '+c.name,show:'Show all of '+c.name,short:c.short,atlas:'Urban Atlas of '+c.name,
    unit1:{one:'unit',many:'units',One:'Unit',Many:'Units',the:'the units',acc:'the unit'},unit2:{one:'sub-unit',many:'sub-units',One:'Sub-unit',Many:'Sub-units',short:'SU'}};
  return {...c,...en,unitsNote:en.unitsNote ?? ''};
}
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
  document.title = L('Zgjerimi urban ','Urban expansion ')+C.in;
  document.querySelector('meta[name=description]')?.setAttribute('content',L(`Eksploro historinë e zgjerimit urban të çdo vendbanimi ${C.in}, nga të dhënat satelitore të DLR.`,`Explore the history of urban expansion of every settlement ${C.in}, from DLR satellite data.`));
  set('brandMark',C.mark);set('brandRegion','/ '+C.short);
  $('heroTitle').innerHTML = `${L('Zgjerimi urban','Urban expansion')}<br>${esc(C.in)}<span>.</span>`;
  $('whole').firstChild.textContent = C.show+' ';
  for (const el of document.querySelectorAll('.signature')) el.textContent = '© Rizah Murseli · '+C.atlas;
  set('unitsNote',C.unitsNote || '');
  $('offlineLink').href = C.id === 'XKX' ? 'kosova-urban.html' : `atlas-${C.id.toLowerCase()}.html`;
  set('citeText',L(`Murseli, R. (2026). Zgjerimi urban ${C.in}: atlas interaktiv i zonave të ndërtuara, 1985–2026. Të dhënat: DLR World Settlement Footprint.`,`Murseli, R. (2026). Urban expansion ${C.in}: an interactive atlas of built-up areas, 1985–2026. Data: DLR World Settlement Footprint.`));
  $('overview').setAttribute('aria-label',L('Kliko për të zgjedhur një pikë ','Click to pick a point ')+C.in);
  set('tabNation',C.name);set('nationEvoTitle',C.whole+' · 1985–2015');set('nationTrkTitle',C.whole+' · 2016–2026');
  set('munLabelText','1 · '+C.unit1.Many);set('zoneLabelText','2 · '+C.unit2.Many);
  const centres = places.filter(p => p.municipal).length;
  set('raceStory',L(`${centres} qendrat e ${C.unit1.many.replace(/a$/,'ave').replace(/i$/,'ive')}, krahasuar në rreze të njëjtë prej 5 km nga qendra. Renditja ndjek vitin në kohëzgjatje; luaje animacionin për ta parë garën.`,`${centres} ${C.unit1.one} centres, compared within the same 5 km radius of the centre. The ranking follows the timeline; play the animation to watch the race.`));
  set('tabRace',L('Gara 5 km','5 km race'));
  const presetPlaces = (C.presets || []).map(n => places.find(p => p.name === n)).filter(Boolean);
  $('presets').innerHTML = (presetPlaces.length ? presetPlaces : places.filter(p => p.municipal).slice(0,3)).map(p => `<button data-place="${esc(p.name)}">${esc(p.name)}</button>`).join('');
  for (const b of $('presets').querySelectorAll('[data-place]')) b.onclick = () => { const place = places.find(p => p.name === b.dataset.place);if (place) selectPlace(place); };
  const sel = $('country');
  sel.innerHTML = countries.map(c => `<option value="${c.id}">${esc(LANG === 'en' && COUNTRY_EN[c.id] ? COUNTRY_EN[c.id].name : c.name)}</option>`).join('');
  sel.value = C.id;
  $('countryBox').hidden = countries.length < 2;
}
const cache = new Map();
const RADIAL = {lens:.27,inner:.305,outer:.455,span:66};
const canvas = $('map');
const context = canvas.getContext('2d');
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Time axis comes from manifest.json, so new WSF Tracker steps need no code change.
// Base year: the analysis can start at any step. period() returns the steps from that step on,
// and every per-step series (units, municipalities, national) is sliced the same way in applyBase().
state.base = {evolution:0,tracker:0};
const baseOff = (name=state.period) => state.base[name] || 0;
const periodCache = {};
const period = (name=state.period) => {
  const raw = manifest.periods[name], off = baseOff(name), key = name+':'+off;
  if (periodCache[key]) return periodCache[key];
  const steps = raw.steps.map(st => ({...st,label:trLabel(st.label),epoch:trEpoch(st.epoch),july:/^Korrik/.test(st.label)})).slice(off);
  if (off) steps[0] = {...steps[0],epoch:(/^Janar/.test(raw.steps[off].label) ? L('JANAR · ','JANUARY · ') : /^Korrik/.test(raw.steps[off].label) ? L('KORRIK · ','JULY · ') : '')+L('VITI BAZË','BASE YEAR')};
  const lab = st => L(st.label.toLowerCase(),trLabel(st.label));
  return periodCache[key] = {...raw,steps,rawOffset:off,source:tx(raw.source),
    range:off || LANG === 'en' ? `${lab(raw.steps[off])} – ${lab(raw.steps.at(-1))}` : raw.range};
};
function rebaseSeries(obj) {
  if (!obj) return;
  if (!obj._r) Object.defineProperty(obj,'_r',{value:{},enumerable:false});
  for (const p of Object.keys(manifest.periods)) {
    if (!obj[p] && !obj._r[p]) continue;
    if (!obj._r[p]) obj._r[p] = obj[p];
    obj[p] = obj._r[p].slice(baseOff(p));
  }
}
const rawSeries = (obj,p) => obj._r?.[p] || obj[p];
// Raw WSF code (1 = first step) → code relative to the base step (1 = built by the base year).
function baseRemap(name=state.period) {
  const off = baseOff(name), n = manifest.periods[name].steps.length, out = new Uint8Array(256);
  for (let k=1;k<=n;k++) out[k] = k <= off+1 ? 1 : k-off;
  return out;
}
function applyBase() {
  if (stats) { rebaseSeries(stats.national);stats.municipal.forEach(rebaseSeries); }
  if (units) { units.municipalities.forEach(rebaseSeries);units.cadastral.forEach(rebaseSeries);rebaseSeries(units.kosovo); }
}
function setBase(off) {
  const name = state.period, raw = manifest.periods[name], old = baseOff(name);
  off = Math.max(0,Math.min(raw.steps.length-2,off|0));
  if (off === old && $('baseYear').value === String(off)) return;
  const keep = i => Math.max(0,Math.min(raw.steps.length-1-off,i+old-off));
  state.index = keep(state.index);state.compareIndex = keep(state.compareIndex);
  state.base[name] = off;
  applyBase();
  sdgCache = null;
  syncBaseControl();
  buildLegend();
  sample = null;viewStats = null;
  paint();
  loadView();
}
function syncBaseControl() {
  const raw = manifest.periods[state.period];
  $('baseYear').replaceChildren(...raw.steps.slice(0,-1).map((st,i) => new Option(trLabel(st.label)+(i ? '' : L(' · fillimi i serisë',' · start of the series')),String(i))));
  $('baseYear').value = String(baseOff());
}
const count = () => period().steps.length;
const stepYear = i => period().steps[i].year;
const yearLabel = (i,name) => period(name).steps[i].label;
const stepIndexOfYear = (year,name) => period(name).steps.findIndex(s => s.year === year && !s.july);
const number = value => new Intl.NumberFormat(LOCALE,{maximumFractionDigits:2}).format(value);
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
  $('play').innerHTML = L('▶ <span>Luaj</span>','▶ <span>Play</span>');
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
    if (!response.ok) throw new Error(L('Pllaka e të dhënave nuk u ngarkua.','A data tile failed to load.'));
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
  $('status').textContent = L('Duke ngarkuar zonën…','Loading the area…');
  viewStats = null;
  updateView();
  context.fillStyle = '#070c14';
  context.fillRect(0,0,canvas.width,canvas.height);
  overview();
  const v = {...view};
  const grid = new Uint8Array(v.size*v.size), remap = baseRemap();
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
          if (mask[index*4+3] > 127) grid[index] = remap[values[row*size+col]];
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
    $('status').textContent = L('Ngarkimi dështoi. ','Loading failed. ');
    const retry = document.createElement('button');
    retry.textContent = L('Provo përsëri','Try again');
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
    button.setAttribute('aria-label',L('Shfaq ','Show ')+yearLabel(i));
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
  $('year').style.color = state.mapView === 'forms' ? '#e8eef6' : 'rgb('+color.join(',')+')';
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
  const sprawlOn = state.mapView === 'forms' && sprawlCurrent(), formsWait = state.mapView === 'forms' && !sprawlOn;
  for (let i=0;i<sample.length;i++) {
    const code = sample[i];
    const index = mode === 'compare' && i%size < split ? state.compareIndex : state.index;
    const detected = code && code <= index+1;
    const outside = filterMask && !filterMask.data[i];
    let c;
    if (!detected) c = mask[i*4+3] > 127 ? land : sea;
    else if (sprawlOn) c = code === 1 ? palette[0] : land;
    else if (formsWait) c = code === 1 ? palette[0] : [118,130,150];   // forms view while classifying: no year colours
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
  drawSprawl();
  
  drawUnits();
  drawAoi();
  pathFor(context,(lon,lat) => [view.x+(lon-view.west)/(view.east-view.west)*view.size,view.y+(view.north-lat)/(view.north-view.south)*view.size]);
  context.strokeStyle = '#34445c';
  context.lineWidth = .8;
  context.stroke();
  const area = (state.span/view.size)**2;
  $('total').textContent = number(total*area)+' km²';
  lastStats = {total:total*area,added:added*area};
  $('totalLabel').textContent = !filterMask ? L('Zonë e ndërtuar në pamje','Built-up area in view') : filterMask.kind === 'aoi' ? L('Zonë e ndërtuar në zonën e interesit','Built-up area in the zone of interest') : filterMask.kind === 'circle' ? L('Zonë e ndërtuar brenda rrethit','Built-up area inside the circle') : filterMask.circle ? L('Zonë e ndërtuar brenda rrethit dhe filtrit','Built-up area inside the circle and filter') : L('Zonë e ndërtuar brenda filtrit','Built-up area inside the filter');
  $('growth').textContent = state.index ? '+'+number(added*area)+' km²' : L('Gjendja fillestare','Baseline');
  const scaleKm = state.span > 60 ? 20 : state.span > 15 ? 5 : state.span > 5 ? 2 : 1;
  $('scale').firstElementChild.style.width = (scaleKm/state.span*view.size*canvas.clientWidth/canvas.width)+'px';
  $('scale').lastElementChild.textContent = scaleKm+' km';
  $('scale').style.visibility = 'visible';
  if (mode === 'compare') {
    $('divider').style.left = (state.split*100)+'%';
    $('divider').setAttribute('aria-valuenow',Math.round(state.split*100));
    $('compareB').textContent = L('Djathtas ','Right ')+yearLabel(state.index);
  }
  overview();
  renderRadial();
  renderAoiDraft();
  if (state.sprawl && !(state.sprawlMode === 'two' && state.index === 0) && (!sprawlRes || sprawlRes.key !== sprawlCalcKey())) { scheduleSprawl();renderSprawlPanel(); }
  else if (state.sprawl && sprawlCurrent() && sprawlRes.viewKey !== sprawlViewKey()) { sprawlView();if (sprawlRes.viewKey) { renderSprawlPanel();paint(true); } }
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
  osm:{html:L('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">kontribuuesit e OpenStreetMap</a>','© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>')+(LOCAL_FILE ? ' · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' : ''),text:L('Harta bazë © OpenStreetMap','Base map © OpenStreetMap')+(LOCAL_FILE ? ', CARTO' : '')},
  esri:{html:L('Imazhi © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics','Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics'),text:L('Imazhi satelitor © Esri, Maxar, Earthstar Geographics','Satellite imagery © Esri, Maxar, Earthstar Geographics')},
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
    subtitle.textContent = (place.municipal ? L(`Qendër · ${C.unit1.one} · `,`Centre · ${C.unit1.one} · `) : '')+place.lat.toFixed(3)+'° N, '+place.lon.toFixed(3)+'° E';
    button.append(title,subtitle);
    button.onclick = () => selectPlace(place);
    $('results').append(button);
  }
  if (!matches.length) {
    const p = document.createElement('p');p.textContent = L('Emri nuk u gjet. Mund të zgjedhësh pikën në hartën e vogël.','Name not found. You can pick the point on the small map.');$('results').append(p);
  }
  $('results').hidden = false;
  $('search').setAttribute('aria-expanded','true');
}
function updateHash() {
  const params = new URLSearchParams({c:C.id,lat:state.lat.toFixed(5),lon:state.lon.toFixed(5),km:String(state.span),p:state.period,name:state.name,m:state.mode,b:state.basemap ? state.basemapSource : '0',bm:state.basemapMode,bt:String(state.basemapTransp),r:state.radial ? '1' : '0',u:state.unitsOverlay ? '1' : '0'});
  if (state.tab !== 'zone') params.set('t',state.tab);
  if (baseOff()) params.set('by',(period().steps[0].july ? '7-' : '')+period().steps[0].year);
  if (MUN.size) params.set('mun',[...MUN].join('.'));
  if (ZONE.size && ZONE.size <= 60) params.set('zk',[...ZONE].join('.'));
  if (state.aoi) params.set('aoi','1');
  if (LANG === 'en') params.set('l','en');
  if (state.mapView !== 'time') params.set('mv',state.mapView);
  if (state.sprawl && state.sprawlMode === 'two') params.set('sp','2');
  if (state.sprawl && state.sprawlShow !== 'stage') params.set('ss',state.sprawlShow);
  if (state.sprawl && state.stageCuts.join(',') !== '1,10,50') params.set('sc',state.stageCuts.join(','));
  history.replaceState(null,'','#'+params.toString());
}
function pointAt(lon,lat) {
  const [bw,bs,be,bn] = manifest.bounds;
  if (lon < bw || lon > be || lat < bs || lat > bn) return;
  Object.assign(state,{lon,lat,name:L('Zonë e zgjedhur','Selected area')});
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
$('period').onchange = () => { state.period = $('period').value;state.index = state.compareIndex = 0;sample = null;viewStats = null;syncBaseControl();buildLegend();paint();loadView(); };
$('baseYear').onchange = () => setBase(Number($('baseYear').value));
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
  $('play').innerHTML = L('Ⅱ <span>Ndalo</span>','Ⅱ <span>Pause</span>');
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
  } else if (aoiDraft) {
    draftClick(event);
  } else if (units && state.unitsOverlay && !state.aoi) {
    // A click (no drag) selects or deselects the unit under the pointer.
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX-rect.left)*canvas.width/rect.width-view.x, y = (event.clientY-rect.top)*canvas.height/rect.height-view.y;
    clickUnitAt(view.west+x/view.size*(view.east-view.west),view.north-y/view.size*(view.north-view.south));
  }
  drag = null;
};
canvas.onpointercancel = () => { drag = null; };
canvas.ondblclick = event => {
  if (aoiDraft) { event.preventDefault();endDraw(true);return; }
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
    C = countryText(manifest.country);
    stats = await fetch(BASE+'stats.json').then(r => r.ok ? r.json() : null).catch(() => null);
    units = await fetch(BASE+'units.json').then(r => r.ok ? r.json() : null).then(raw => raw && decodeUnits(raw)).catch(error => { console.error(error);return null; });
    population = await fetch(BASE+'population.json').then(r => r.ok ? r.json() : null).catch(() => null);
    landcover = await fetch(BASE+'landcover.json').then(r => r.ok ? r.json() : null).catch(() => null);
    soil = await fetch(BASE+'soil.json').then(r => r.ok ? r.json() : null).catch(() => null);
    if (LANG === 'en') {
      if (landcover) { landcover.classes.forEach(c => { c.label = tx(c.label); });landcover.steps.forEach(st => { st.label = trLabel(st.label); }); }
      if (population?.sources) for (const src of Object.values(population.sources)) { src.label = tx(src.label);src.source = tx(src.source);src.note = tx(src.note); }
      if (soil) soil.source = tx(soil.source);
    }
    applyCountryText();
    if (units && !units.cadastral.length) $('zonePick').closest('.cascade').classList.add('single-level');
    if (population && !population.sources) population = null;  // old format
    if (units && population) {
      popSource = population.default || Object.keys(population.sources)[0];
      for (const u of units.municipalities) { const p = population.municipalities[u.id];if (p) u.pop = {estimate:!!p.estimate}; }
    }
    if (!units || !population) document.querySelector('[data-tab=sdg]').hidden = true;
    for (const option of $('period').options) option.textContent = manifest.periods[option.value].title;
    if (manifest.updated) $('dataUpdated').textContent = L(` (përditësimi i fundit: ${manifest.updated})`,` (last update: ${manifest.updated})`);
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
      Object.assign(state,{lat,lon,span:km,name:hash.get('name') || L('Zonë e zgjedhur','Selected area'),period:hash.get('p') === 'tracker' ? 'tracker' : 'evolution'});
    }
    if (['cumulative','added','compare'].includes(hash.get('m'))) setMode(hash.get('m'),false);
    if (hash.get('b') === '0') state.basemap = false;
    if (TILE_URLS[hash.get('b')]) state.basemapSource = hash.get('b');
    if (BASEMAP_FILTER[hash.get('bm')]) state.basemapMode = hash.get('bm');
    if (hash.has('bt') && Number(hash.get('bt')) >= 0 && Number(hash.get('bt')) <= 95) state.basemapTransp = Number(hash.get('bt'));
    if (hash.get('r') === '0') state.radial = false;
    if (hash.get('sp') === '1' || hash.get('sp') === '2') { state.mapView = 'forms';state.sprawlMode = hash.get('sp') === '2' ? 'two' : 'steps'; }
    if (hash.get('mv') === 'forms') state.mapView = 'forms';
    if (['year','class','now','stage'].includes(hash.get('ss'))) state.sprawlShow = hash.get('ss');
    if (hash.get('sc')) { const v = hash.get('sc').split(',').map(Number);if (v.length === 3 && v[0] > 0 && v[1] > v[0] && v[2] > v[1]) { state.stageCuts = v;state.sprawlNucleus = v[1]; } }
    else if (['5','25','50'].includes(hash.get('sn'))) { state.sprawlNucleus = Number(hash.get('sn'));state.stageCuts = [1,state.sprawlNucleus,Math.max(50,state.sprawlNucleus*2)]; }
    if (['units','sdg','race','kosovo'].includes(hash.get('t'))) openTab = hash.get('t');
    if (hash.get('u') === '0') state.unitsOverlay = false;
    if (units) {
      for (const id of (hash.get('mun') || hash.get('f') || '').split('.')) if (units.byId.municipalities.has(id)) MUN.add(id);
      for (const id of (hash.get('zk') || '').split('.')) if (units.byId.cadastral.has(id)) ZONE.add(id);
      syncFilter();
    }
    $('toggleUnits').setAttribute('aria-pressed',String(state.unitsOverlay));
    $('toggleRadial').setAttribute('aria-pressed',String(state.radial));
    setMapView(state.mapView,false);
    $('toggleBasemap').setAttribute('aria-pressed',String(state.basemap));
    syncBasemapControls();
    $('period').value = state.period;
    if (hash.has('by')) {
      // by=2000, or by=7-2016 for the July 2016 Tracker step
      const want = hash.get('by'), july = /^7-/.test(want), y = Number(want.replace(/^7-/,''));
      const k = manifest.periods[state.period].steps.findIndex(st => st.year === y && /^Korrik/.test(st.label) === july);
      if (k > 0 && k < manifest.periods[state.period].steps.length-1) state.base[state.period] = k;
    }
    applyBase();
    syncBaseControl();
    if (hash.get('aoi') === '1') restoreAoi();
    $('search').value = state.name;
    buildLegend();
    paint();
    await loadView();
    if (openTab) document.querySelector(`[data-tab=${openTab}]`)?.click();
  } catch(error) {
    $('status').textContent = L('Të dhënat nuk u ngarkuan. Rifresko faqen për të provuar përsëri.','The data did not load. Refresh the page to try again.');
    console.error(error);
  }
}
// ---------- Analysis: statistics for the visible area ----------
const events = [{year:1999,label:L('1999 · fundi i luftës','1999 · end of the war'),anchor:'end'},{year:2008,label:L('2008 · pavarësia','2008 · independence'),anchor:'start'}];
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
  if (state.aoi) return aoiMask(v);
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
    return {kind:'circle',data,radius,label:L('rrethi','the circle')};
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
  if (!s || !s.rings) { host.innerHTML = L('<p class="note">Profili sipas largësisë shfaqet kur pamja është më e vogël se 40 km.</p>','<p class="note">The distance profile is shown when the view is smaller than 40 km.</p>');return; }
  const W = Math.max(240,host.clientWidth), H = 130, m = {l:34,r:6,t:8,b:20};
  const iw = W-m.l-m.r, ih = H-m.t-m.b, n = s.rings, palette = colors();
  const base = Array.from({length:n},(_,r) => ringShare(r,0));
  const now = Array.from({length:n},(_,r) => ringShare(r,state.index));
  const max = niceMax(Math.max(...now,...base,1));
  const y = v => m.t+ih-v/max*ih, band = iw/n, bw = Math.max(2,(band-6)/2);
  const nowColor = 'rgb('+palette[state.index].join(',')+')';
  let svg = L(`<svg width="${W}" height="${H}" role="img" aria-label="Përqindja e tokës së ndërtuar sipas largësisë">`,`<svg width="${W}" height="${H}" role="img" aria-label="Share of built-up land by distance">`);
  for (const t of [0,max/2,max]) svg += `<line class="${t ? 'grid' : 'axis'}" x1="${m.l}" x2="${W-m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l-5}" y="${y(t)+3}" text-anchor="end">${number(t)}%</text>`;
  for (let r=0;r<n;r++) {
    const x0 = m.l+r*band+2;
    svg += `<rect x="${x0}" y="${y(base[r])}" width="${bw}" height="${m.t+ih-y(base[r])}" rx="1.5" fill="rgb(${palette[0].join(',')})"/>`;
    if (state.index) svg += `<rect x="${x0+bw+2}" y="${y(now[r])}" width="${bw}" height="${m.t+ih-y(now[r])}" rx="1.5" fill="${nowColor}"/>`;
    svg += `<text x="${x0+band/2-2}" y="${H-5}" text-anchor="middle">${band < 48 ? number((r+1)*s.step) : number(r*s.step)+'–'+number((r+1)*s.step)}</text>`;
    svg += `<rect class="hit" data-r="${r}" x="${m.l+r*band}" y="0" width="${band}" height="${H}"/>`;
  }
  svg += L(`</svg><div class="chart-tip" hidden></div><div class="legend-row"><span><i style="background:rgb(${palette[0].join(',')})"></i>${yearLabel(0)}</span>${state.index ? `<span><i style="background:${nowColor}"></i>${yearLabel(state.index)}</span>` : ''}<span>${band < 48 ? 'kufiri i jashtëm i unazës, km' : 'km nga qendra'}</span></div>`,`</svg><div class="chart-tip" hidden></div><div class="legend-row"><span><i style="background:rgb(${palette[0].join(',')})"></i>${yearLabel(0)}</span>${state.index ? `<span><i style="background:${nowColor}"></i>${yearLabel(state.index)}</span>` : ''}<span>${band < 48 ? 'outer edge of the ring, km' : 'km from the centre'}</span></div>`);
  let gain = -1, gainRing = 0;
  for (let r=0;r<n;r++) { const g = (now[r]-base[r])*s.ringLand[r]; if (g > gain) { gain = g;gainRing = r; } }
  if (state.index && gain > 0) svg += L(`<p class="note">Shtesa më e madhe në sipërfaqe ndodhi në unazën <b>${number(gainRing*s.step)}–${number((gainRing+1)*s.step)} km</b> nga qendra.</p>`,`<p class="note">The largest added area was in the ring <b>${number(gainRing*s.step)}–${number((gainRing+1)*s.step)} km</b> from the centre.</p>`);
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
  if (!s) { $('zoneStory').textContent = L('Duke llogaritur…','Calculating…');return; }
  const c = s.cumulative, n = c.length, palette = colors();
  const start = c[0], end = c[n-1], growth = end-start;
  let peak = 1;
  for (let i=2;i<n;i++) if (s.added[i] > s.added[peak]) peak = i;
  const ratio = start > 0 ? end/start : null;
  const scope = !s.filter ? L(`Në këtë pamje (${esc(state.name)})`,`In this view (${esc(state.name)})`) : s.filter.kind === 'aoi' ? L(`Brenda zonës së interesit <b>${esc(s.filter.label)}</b> (${number(Math.round(s.landKm2*1000)/10)} ha${s.filter.partial ? ', vetëm pjesa në pamje' : ''})`,`Inside the zone of interest <b>${esc(s.filter.label)}</b> (${number(Math.round(s.landKm2*1000)/10)} ha${s.filter.partial ? ', only the part in view' : ''})`) : s.filter.kind === 'circle' ? L(`Brenda rrethit me rreze ${number(Math.round(s.lensKm*10)/10)} km rreth ${esc(state.name)}`,`Inside the ${number(Math.round(s.lensKm*10)/10)} km radius circle around ${esc(state.name)}`) : s.filter.circle ? L(`Brenda rrethit me rreze ${number(Math.round(s.lensKm*10)/10)} km, vetëm në ${esc(s.filter.label)}`,`Inside the ${number(Math.round(s.lensKm*10)/10)} km radius circle, only in ${esc(s.filter.label)}`) : L(`Brenda filtrit (${esc(s.filter.label)})`,`Inside the filter (${esc(s.filter.label)})`);
  let story = L(`${scope}, zona e ndërtuar kalon nga <b>${km2(start)}</b> (${yearLabel(0)}) në <b>${km2(end)}</b> (${yearLabel(n-1)})`,`${scope}, the built-up area grows from <b>${km2(start)}</b> (${yearLabel(0)}) to <b>${km2(end)}</b> (${yearLabel(n-1)})`);
  story += ratio && ratio >= 1.5 ? L(`, rreth <b>${number(Math.round(ratio*10)/10)} herë</b> më shumë.`,`, about <b>${number(Math.round(ratio*10)/10)} times</b> as much.`) : ratio ? `, <b>+${number(Math.round((ratio-1)*1000)/10)}%</b>.` : '.';
  if (state.period === 'evolution' && growth > 0 && stepIndexOfYear(1999) > 0) {
    const after = (end-c[stepIndexOfYear(1999)])/growth*100;
    story += L(` <b>${number(Math.round(after))}%</b> e kësaj rritjeje u regjistrua pas vitit 1999.`,` <b>${number(Math.round(after))}%</b> of this growth was recorded after 1999.`);
  }
  if (period().steps[0].july) story += L(` Shtesa e hapit të parë (${yearLabel(1)}) mbulon vetëm gjashtë muaj.`,` The first step's addition (${yearLabel(1)}) covers only six months.`);
  $('zoneStory').innerHTML = story;
  $('kpiGrowth').textContent = ratio ? '+'+number(Math.round((ratio-1)*100))+'%' : '—';
  $('kpiPeak').textContent = growth > 0 ? yearOnly(yearLabel(peak)) : '—';
  $('kpiPeak').title = growth > 0 ? '+'+km2(s.added[peak]) : '';
  $('kpiAvg').textContent = number(Math.round(growth/(n-1)*100)/100)+' km²';
  const pickYear = i => setIndex(i);
  timeChart($('chartCumulative'),{values:c,years:period().steps.map(s => s.year),active:state.index,events:state.period === 'evolution' ? events : null,
    label:L('Zona e ndërtuar kumulative','Cumulative built-up area'),onPick:pickYear,tip:i => `${yearLabel(i)}<br><b>${km2(c[i])}</b>`});
  const added = s.added.map((v,i) => i ? v : 0);
  timeChart($('chartAdded'),{kind:'bars',values:added,years:period().steps.map(s => s.year),active:state.index,colors:palette.map(p => 'rgb('+p.join(',')+')'),
    label:L('Shtesa sipas vitit','Added area by year'),onPick:pickYear,tip:i => i ? `${yearLabel(i)}<br><b>+${km2(added[i])}</b>` : L(`${yearLabel(0)}<br>Gjendja fillestare`,`${yearLabel(0)}<br>Baseline`)});
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
    row.title = L(`${m.name} · ${yearLabel(idx)} · ${km2(m[period][idx])} brenda 5 km`,`${m.name} · ${yearLabel(idx)} · ${km2(m[period][idx])} within 5 km`);
  });
}
// ---------- Kosovo-wide view and fastest-growing settlements ----------
function renderKosovo() {
  if (!stats) { $('kosovoStory').textContent = L('Statistikat nuk u ngarkuan.','Statistics did not load.');return; }
  const e = stats.national.evolution, t = stats.national.tracker;
  const i99 = stepIndexOfYear(1999,'evolution'), share = i99 > 0 ? (e[e.length-1]-e[i99])/(e[e.length-1]-e[0])*100 : null;
  const pe = period('evolution'), pt = period('tracker');
  $('kosovoStory').innerHTML = L(`Sipas WSF Evolution, zona e ndërtuar ${C.in} u rrit nga <b>${km2(e[0])}</b> në ${pe.steps[0].label} në <b>${km2(e[e.length-1])}</b> në ${pe.steps.at(-1).label}, <b>${number(Math.round(e[e.length-1]/e[0]*10)/10)} herë</b> më shumë.${share != null ? ` Rreth <b>${number(Math.round(share))}%</b> e kësaj rritjeje erdhi pas vitit 1999.` : ''} Tracker, me rezolucion më të imët, regjistron <b>+${number(Math.round((t[t.length-1]/t[0]-1)*100))}%</b> nga ${pt.steps[0].label.toLowerCase()} deri në ${pt.steps.at(-1).label.toLowerCase()}.`,`According to WSF Evolution, the built-up area ${C.in} grew from <b>${km2(e[0])}</b> in ${pe.steps[0].label} to <b>${km2(e[e.length-1])}</b> in ${pe.steps.at(-1).label}, <b>${number(Math.round(e[e.length-1]/e[0]*10)/10)} times</b> as much.${share != null ? ` About <b>${number(Math.round(share))}%</b> of this growth came after 1999.` : ''} Tracker, at finer resolution, records <b>+${number(Math.round((t[t.length-1]/t[0]-1)*100))}%</b> from ${pt.steps[0].label} to ${pt.steps.at(-1).label}.`);
  const go = (period,i) => {
    if (state.period !== period) { $('period').value = period;$('period').onchange(); }
    setIndex(i);
  };
  timeChart($('chartNationEvo'),{values:e,years:pe.steps.map(s => s.year),events,active:state.period === 'evolution' ? state.index : null,color:'#5e9bff',
    label:C.name+' '+pe.range,onPick:i => go('evolution',i),tip:i => `${yearLabel(i,'evolution')}<br><b>${km2(e[i])}</b>`+(i ? `<br>+${km2(e[i]-e[i-1])}` : '')});
  timeChart($('chartNationTrk'),{values:t,years:pt.steps.map(s => s.year),active:state.period === 'tracker' ? state.index : null,color:'#5e9bff',
    label:C.name+' '+pt.range,onPick:i => go('tracker',i),tip:i => `${yearLabel(i,'tracker')}<br><b>${km2(t[i])}</b>`+(i ? `<br>+${km2(t[i]-t[i-1])}` : '')});
  const [a,b] = state.period === 'evolution' ? [0,1] : [2,3];
  $('hotTitle').innerHTML = L(`Vendbanimet me shtesën më të madhe <small>${manifest.periods[state.period].range} · brenda 1 km nga pika e vendbanimit</small>`,`Settlements with the largest additions <small>${trLabel(manifest.periods[state.period].range)} · within 1 km of the settlement point</small>`);
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
  if (state.tab === 'zone') { renderZone();renderSprawlPanel(); }
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
  if (!code) text = L('Pa ndërtim të identifikuar','No built-up area detected');
  else if (code === 1) text = L(`<i style="background:rgb(${palette[0].join(',')})"></i>Ndërtuar deri në <b>${yearLabel(0).toLowerCase()}</b>`,`<i style="background:rgb(${palette[0].join(',')})"></i>Built by <b>${yearLabel(0)}</b>`);
  else text = L(`<i style="background:rgb(${palette[code-1].join(',')})"></i>Identifikuar në <b>${yearLabel(code-1)}</b>`,`<i style="background:rgb(${palette[code-1].join(',')})"></i>Detected in <b>${yearLabel(code-1)}</b>`);
  let where = '';
  if (units) {
    const lon = view.west+(x+.5)/view.size*(view.east-view.west), lat = view.north-(y+.5)/view.size*(view.north-view.south);
    const m = unitAt(lon,lat,'municipalities'), c = unitAt(lon,lat,'cadastral');
    if (m) where = L(`<small>${esc(C.unit1.One)}: <b>${esc(m.name)}</b>${c ? ` · ${esc(C.unit2.short)}: <b>${esc(c.name)}</b>` : ''}${state.unitsOverlay ? (MUN.has(m.id) ? (c ? ` · kliko: ${ZONE.has(c.id) ? 'hiqe' : 'zgjidhe'} njësinë` : '') : ` · kliko: shto ${esc(C.unit1.acc)} në filtër`) : ''}</small>`,`<small>${esc(C.unit1.One)}: <b>${esc(m.name)}</b>${c ? ` · ${esc(C.unit2.short)}: <b>${esc(c.name)}</b>` : ''}${state.unitsOverlay ? (MUN.has(m.id) ? (c ? ` · click: ${ZONE.has(c.id) ? 'remove' : 'select'} the unit` : '') : ` · click: add the ${esc(C.unit1.one)} to the filter`) : ''}</small>`);
  }
  $('tip').innerHTML = text+where+L(`<small>${number(Math.round(km*10)/10)} km nga qendra e pamjes</small>`,`<small>${number(Math.round(km*10)/10)} km from the centre of the view</small>`);
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
const DIRS = [L('VERI','NORTH'),L('LINDJE','EAST'),L('JUG','SOUTH'),L('PERËNDIM','WEST')];
// Shades of a year's colour for the three distance bands: darker near the centre, lighter at the edge.
const shade = (rgb,band) => {
  const mix = band === 0 ? rgb.map(v => Math.round(v*.55)) : band === 2 ? rgb.map(v => Math.round(v+(255-v)*.5)) : rgb;
  return 'rgb('+mix.join(',')+')';
};
const BAND_NAMES = [L('afër qendrës','near the centre'),L('në mes','middle'),L('në skaj','outer edge')];
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
  $('radialKeyText').innerHTML = s?.filter?.kind === 'aoi' ? L(`Shtesat vjetore brenda zonës së interesit <span class="kname">${esc(s.filter.label)}</span>, sipas drejtimit nga qendra e pamjes.`,`Annual additions inside the zone of interest <span class="kname">${esc(s.filter.label)}</span>, by direction from the centre of the view.`) : byUnits ? L(`Shtesat vjetore brenda rrethit (rrezja <output id="lensKm">${number(Math.round(RADIAL.lens*state.span*10)/10)} km</output>) dhe brenda <span class="kname">${esc(s.filter.label)}</span>, sipas drejtimit.`,`Annual additions inside the circle (radius <output id="lensKm">${number(Math.round(RADIAL.lens*state.span*10)/10)} km</output>) and inside <span class="kname">${esc(s.filter.label)}</span>, by direction.`) : L(`Shtesat vjetore brenda rrethit (rrezja <output id="lensKm">${number(Math.round(RADIAL.lens*state.span*10)/10)} km</output>), sipas drejtimit.`,`Annual additions inside the circle (radius <output id="lensKm">${number(Math.round(RADIAL.lens*state.span*10)/10)} km</output>), by direction.`);
  // In the forms view the bars are stacked by the class shown on the map, in the same colours.
  const fr = typeof sprawlRadial === 'function' ? sprawlRadial() : null;
  if (fr) {
    const show = sprawlRes.mode === 'steps' ? state.sprawlShow : 'class';
    $('radialKeyText').innerHTML += ' '+(state.index === 0 ? L('Shtyllat e zbehura tregojnë ndërtimin e viteve në vijim, me klasën kur u ndërtua; ngjyrat si në hartë.','Faded bars show the construction of the coming years, in its class when built; colours as on the map.') : show === 'now' ? L(`Ngjyrat: klasa e ndërtimit në ${esc(period().steps[state.index].short)}, si në hartë.`,`Colours: the class of construction in ${esc(period().steps[state.index].short)}, as on the map.`)
      : show === 'year' ? L('Ngjyrat: klasa e shtesave të këtij viti, si në hartë.','Colours: the class of this year\'s additions, as on the map.') : L('Ngjyrat: klasa kur u ndërtua, si në hartë.','Colours: the class when built, as on the map.'));
  }
  const swEl = $('radialSwatches');
  if (swEl.dataset.bands == null) swEl.dataset.bands = swEl.innerHTML;
  swEl.hidden = !!fr;
  swEl.innerHTML = fr ? [0,1,2,...(fr.some(dir => dir[3].some(v => v > 0)) ? [3] : [])].map(l => `<span><i class="sw" style="background:rgb(${sprawlRadialColor(l).join(',')})"></i>${esc(sprawlRadialName(l))}</span>`).join('') : swEl.dataset.bands;
  $('radialKeyNote').textContent = fr ? L('Çdo shtyllë është një vit ndërtimi; koha ecën në drejtim të akrepave të orës.','Each bar is one year of building; time runs clockwise.') : L('Çdo shtyllë është një vit, me ngjyrën e vitit në hartë; koha ecën në drejtim të akrepave të orës.','Each bar is one year, in that year\'s map colour; time runs clockwise.');
  if (s && (s.radial || fr)) {
    const m = count()-1;
    const series = fr || s.radial.map(dir => dir.map(band => Array.from({length:m},(_,k) => band[k+2])));
    const nl = series[0].length, layerSum = (dir,k) => { let t = 0;for (let b=0;b<nl;b++) t += dir[b][k];return t; };
    let max = 0;
    series.forEach(dir => { for (let k=0;k<m;k++) max = Math.max(max,layerSum(dir,k)); });
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
        const color = palette[k+1], opacity = (fr || now >= 0) && k > now ? .25 : 1;
        const a = ang(d,k);
        let base = 0;
        for (let b=0;b<nl;b++) {
          const v = dir[b][k];
          if (v <= 0) continue;
          const ra = r0+base/max*h, rb = r0+(base+v)/max*h;
          out += `<path d="${sector(a-width/2,a+width/2,ra,Math.max(rb,ra+.6))}" fill="${fr ? 'rgb('+sprawlRadialColor(b).join(',')+')' : state.mapView === 'forms' ? shade([118,130,150],b) : shade(color,b)}" opacity="${opacity}"/>`;
          base += v;
        }
      }
      if (now >= 0) {
        const total = layerSum(dir,now);
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
        const names = fr ? series[d].map((_,b) => sprawlRadialName(b)) : BAND_NAMES, sw = b => fr ? 'rgb('+sprawlRadialColor(b).join(',')+')' : shade(colors()[k+1],b);
        const wrap = $('tip').parentElement.getBoundingClientRect();
        $('tip').innerHTML = `<b>${DIRS[d]} · ${yearLabel(k+1)}</b><br>`+v.map((x,b) => fr && x <= 0 ? '' : `<i style="background:${sw(b)}"></i>${names[b]}: +${ha(x)}<br>`).join('')+L(`<small>Kliko për të zgjedhur vitin</small>`,`<small>Click to select the year</small>`);
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
  try { await navigator.clipboard.writeText($('citeText').textContent);$('copyCite').textContent = L('U kopjua ✓','Copied ✓'); }
  catch { $('copyCite').textContent = L('Zgjidhe tekstin për ta kopjuar','Select the text to copy it'); }
  setTimeout(() => { $('copyCite').textContent = L('Kopjo','Copy'); },2500);
};
console.log(L('%c ATLASI URBAN · KOSOVË %c\nKoncepti, analiza dhe zhvillimi: Rizah Murseli\nTë dhënat: DLR World Settlement Footprint · GeoNames · OpenStreetMap','%c URBAN ATLAS %c\nConcept, analysis and development: Rizah Murseli\nData: DLR World Settlement Footprint · GeoNames · OpenStreetMap'),
  'background:#66e0d1;color:#08221e;font-weight:700;padding:3px 6px;border-radius:3px','color:#94a6bd');

// ---------- Administrative units: municipalities and cadastral zones ----------
let units = null;
const unitSel = {municipalities:new Set(),cadastral:new Set()};
const UNIT_COLORS = ['#3987e5','#d95926','#199e70','#c98500','#d55181','#0ca30c','#9085e9','#e66767'];
// Sequential yellow → red: low values yellow, high values red.
const CHORO = ['#ffe48a','#fdb24c','#f57d34','#dc4127','#a81d22'];
Object.assign(state,{unitLevel:'municipalities',unitMetric:'share',unitsOverlay:true,unitQuery:'',unitSort:{key:'metric',dir:-1}});
const METRICS = {
  share:{label:L('Pjesa e territorit të ndërtuar','Share of territory built up'),note:L('Sa përqind e sipërfaqes së njësisë është e ndërtuar. E krahasueshme mes njësive të madhësive të ndryshme.','What percentage of the unit is built up. Comparable across units of different size.'),fmt:v => number(Math.round(v*10)/10)+'%'},
  built:{label:L('Sipërfaqja e ndërtuar','Built-up area'),note:L('Sipërfaqja totale e ndërtuar brenda njësisë.','Total built-up area inside the unit.'),fmt:v => areaFmt(v)},
  growth:{label:L('Rritja nga gjendja fillestare','Growth since the baseline'),note:L('Sa u rrit zona e ndërtuar krahasuar me hapin e parë të periudhës. Njësitë pa ndërtim fillestar nuk kanë vlerë.','How much the built-up area grew compared with the first step of the period. Units with no initial built-up area have no value.'),fmt:v => v == null ? '—' : (v >= 0 ? '+' : '')+number(Math.round(v))+'%'},
  added:{label:L('Shtesa nga gjendja fillestare','Added since the baseline'),note:L('Sipërfaqja e ndërtuar e shtuar që nga hapi i parë i periudhës.','Built-up area added since the first step of the period.'),fmt:v => '+'+areaFmt(v)},
  intensity:{label:L('Shtesa për km² territor','Added per km² of territory'),note:L('Hektarë të rinj ndërtimi për çdo km² të njësisë: tregon presionin e zgjerimit pavarësisht madhësisë.','Hectares of new construction per km² of the unit: shows expansion pressure regardless of size.'),fmt:v => number(Math.round(v*10)/10)+' ha/km²'},
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
  if (state.aoi && filterUnits().length) clearAoi(false);
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
  let svg = L(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Harta tematike e njësive">`,`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Thematic map of the units">`);
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
      tip.innerHTML = L(`<b>${esc(unitLabel(u))}</b><br>${METRICS[state.unitMetric].label}: <b>${METRICS[state.unitMetric].fmt(metricOf(u))}</b><br><small>${yearLabel(state.index)} · territori ${areaFmt(u.areaKm2)}</small>`,`<b>${esc(unitLabel(u))}</b><br>${METRICS[state.unitMetric].label}: <b>${METRICS[state.unitMetric].fmt(metricOf(u))}</b><br><small>${yearLabel(state.index)} · territory ${areaFmt(u.areaKm2)}</small>`);
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
  $('choroLegend').innerHTML = CHORO.map((c,i) => `<span><i style="background:${c}"></i>${ranges[i]}</span>`).join('')+(state.unitMetric === 'growth' ? L('<span><i style="background:#2a3240"></i>pa ndërtim fillestar</span>','<span><i style="background:#2a3240"></i>no initial built-up area</span>') : '')+L(`<span>· klasat sipas ${esc(yearLabel(last))}</span>`,`<span>· classes for ${esc(yearLabel(last))}</span>`);
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
    {key:'area',label:L('Territori','Territory'),val:u => u.areaKm2,show:u => areaFmt(u.areaKm2)},
    {key:'base',label:period().steps[0].short,val:u => u[state.period][0],show:u => areaFmt(u[state.period][0])},
    {key:'now',label:period().steps[last].short,val:u => u[state.period][last],show:u => areaFmt(u[state.period][last])},
    {key:'share',label:'% terr.',val:u => metricOf(u,last,'share'),show:u => METRICS.share.fmt(metricOf(u,last,'share'))},
    {key:'growth',label:L('Rritja','Growth'),val:u => metricOf(u,last,'growth') ?? -1e9,show:u => METRICS.growth.fmt(metricOf(u,last,'growth'))},
    ...(['share','growth'].includes(state.unitMetric) ? [] : [{key:'metric',label:metric.label.split(' ')[0],val:u => metricOf(u,last) ?? -1e9,show:u => metric.fmt(metricOf(u,last))}]),
  ];
  const sortKey = cols.some(c => c.key === state.unitSort.key) ? state.unitSort.key : (cols.find(c => c.key === state.unitMetric) ? state.unitMetric : 'metric');
  const col = cols.find(c => c.key === sortKey) || cols.find(c => c.key === 'share');
  const dir = state.unitSort.dir;
  rows.sort((a,b) => { const x = col.val(a), y = col.val(b);return (typeof x === 'string' ? x.localeCompare(y,LOCALE) : x-y)*dir; });
  const sel = state.unitLevel === 'cadastral' ? ZONE : MUN, limit = 400;
  $('unitTable').tHead.innerHTML = '<tr><th class="l"></th>'+cols.map(c => `<th data-key="${c.key}" class="${c.l ? 'l' : ''} ${c === col ? 'sorted' : ''}">${esc(c.label)}${c === col ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')+'</tr>';
  $('unitTable').tBodies[0].innerHTML = rows.slice(0,limit).map(u => L(`<tr data-id="${u.id}" class="${sel.has(u.id) ? 'sel' : ''}"><td class="l"><input type="checkbox" ${sel.has(u.id) ? 'checked' : ''} aria-label="Zgjidh ${esc(u.name)}"></td>`,`<tr data-id="${u.id}" class="${sel.has(u.id) ? 'sel' : ''}"><td class="l"><input type="checkbox" ${sel.has(u.id) ? 'checked' : ''} aria-label="Select ${esc(u.name)}"></td>`)+cols.map(c => `<td class="${c.l ? 'l' : ''}" title="${c.l ? esc(c.show(u)) : ''}">${c.show(u)}</td>`).join('')+'</tr>').join('');
  $('tableNote').textContent = rows.length > limit ? L(`Shfaqen ${limit} nga ${rows.length} njësi. Përdor kërkimin ose filtrin për të ngushtuar listën; CSV-ja i përfshin të gjitha.`,`Showing ${limit} of ${rows.length} units. Use the search or the filter to narrow the list; the CSV includes them all.`) : L(`${rows.length} njësi · vlerat për ${yearLabel(last)}.`,`${rows.length} units · values for ${yearLabel(last)}.`);
}
function renderUnits() {
  if (!units) return;
  const cad = state.unitLevel === 'cadastral';
  renderPickers();
  const n = filteredUnits().length, mNames = pickedMunicipalities().map(m => m.name).join(', ');
  $('tableTitle').innerHTML = L(`Renditja <small>${cad ? `${n} ${esc(C.unit2.many)} · ${esc(mNames)}` : `${n} ${esc(C.unit1.many)} · kliko për ta shtuar në filtër`} · kliko titullin e kolonës për renditje</small>`,`Ranking <small>${cad ? `${n} ${esc(C.unit2.many)} · ${esc(mNames)}` : `${n} ${esc(C.unit1.many)} · click to add to the filter`} · click a column title to sort</small>`);  $('metricNote').textContent = METRICS[state.unitMetric].note;
  renderChoropleth();
  const picked = selectedUnits(), p = state.period, i = state.index, metric = METRICS[state.unitMetric];
  const chosen = filterUnits();
  $('selCount').textContent = chosen.length ? L(`${chosen.length} njësi në filtër`,`${chosen.length} units in the filter`) : L(`pa filtër · zgjidh ${C.unit1.the} lart, ose kliko në hartë`,`no filter · choose ${C.unit1.the} above, or click on the map`);
  const group = chosen.length ? aggregate(chosen,chosen.length === 1 ? chosen[0].name : L('Përzgjedhja','Selection')) : null;
  if (group) {
    const s = group[p], share = s[i]/group.areaKm2*100, kShare = units.kosovo[p][i]/units.kosovo.areaKm2*100;
    let story = L(`${chosen.length === 1 ? `<b>${esc(unitLabel(chosen[0]))}</b>` : `<b>${chosen.length} njësitë e zgjedhura</b>`} kanë territor ${areaFmt(group.areaKm2)}. Në ${esc(yearLabel(i))} ishin të ndërtuara <b>${areaFmt(s[i])}</b>, pra <b>${METRICS.share.fmt(share)}</b> e territorit (mesatarja: ${METRICS.share.fmt(kShare)} · ${esc(C.name)}).`,`${chosen.length === 1 ? `<b>${esc(unitLabel(chosen[0]))}</b>` : `<b>The ${chosen.length} selected units</b>`} cover ${areaFmt(group.areaKm2)}. In ${esc(yearLabel(i))}, <b>${areaFmt(s[i])}</b> was built up, that is <b>${METRICS.share.fmt(share)}</b> of the territory (average: ${METRICS.share.fmt(kShare)} · ${esc(C.name)}).`);
    if (i > 0) story += L(` Nga ${esc(yearLabel(0))}: <b>${METRICS.growth.fmt(metricOf(group,i,'growth'))}</b>, ose <b>+${areaFmt(s[i]-s[0])}</b>.`,` Since ${esc(yearLabel(0))}: <b>${METRICS.growth.fmt(metricOf(group,i,'growth'))}</b>, or <b>+${areaFmt(s[i]-s[0])}</b>.`);
    if (chosen.length > 1 && i > 0) {
      const ranked = chosen.map(u => [u,metricOf(u,i,'growth')]).filter(r => r[1] != null).sort((a,b) => b[1]-a[1]);
      if (ranked.length) story += L(` Rritja më e shpejtë: <b>${esc(ranked[0][0].name)}</b> (${METRICS.growth.fmt(ranked[0][1])}).`,` Fastest growth: <b>${esc(ranked[0][0].name)}</b> (${METRICS.growth.fmt(ranked[0][1])}).`);
    }
    $('selStory').innerHTML = story;
  } else $('selStory').innerHTML = L(`Pa përzgjedhje, grafiku tregon gjithë territorin (${esc(C.name)}). Zgjidh një ose më shumë ${cad ? C.unit2.many : C.unit1.many} për t'i krahasuar.`,`With no selection, the chart shows the whole territory (${esc(C.name)}). Choose one or more ${cad ? C.unit2.many : C.unit1.many} to compare them.`);
  const years = period().steps.map(s => s.year), labels = period().steps.map(s => s.label);
  const seriesOf = (u,color,extra={}) => ({name:u === units.kosovo ? C.name : unitLabel(u),color,values:labels.map((_,k) => metricOf(u,k)),...extra});
  let series;
  if (!chosen.length) series = [seriesOf(units.kosovo,'#66e0d1')];
  else if (chosen.length <= 8) series = chosen.map((u,k) => seriesOf(u,UNIT_COLORS[k]));
  else series = [seriesOf(group,'#66e0d1',{name:L(`Përzgjedhja (${chosen.length})`,`Selection (${chosen.length})`)})];
  if (picked.length && MUN.size === 1) series.push(seriesOf(pickedMunicipalities()[0],'#c8d3e0',{ref:true,name:pickedMunicipalities()[0].name+L(' (e plotë)',' (whole)')}));
  if (chosen.length && ['share','growth','intensity'].includes(state.unitMetric)) series.push(seriesOf(units.kosovo,'#8a98ab',{ref:true,name:C.name+L(' (referencë)',' (reference)')}));
  $('unitChartTitle').innerHTML = L(`${metric.label} <small>${chosen.length > 8 ? 'përzgjedhja si një e tërë' : 'çdo vijë një njësi'}${series.some(s => s.ref) ? ` · vijat e ndërprera: ${picked.length && MUN.size === 1 ? 'komuna dhe ' : ''}Kosova` : ''}</small>`,`${metric.label} <small>${chosen.length > 8 ? 'the selection as a whole' : 'one line per unit'}${series.some(s => s.ref) ? ` · dashed lines: ${picked.length && MUN.size === 1 ? C.unit1.one+' and ' : ''}${C.name}` : ''}</small>`);
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
  Object.assign(state,{lat,lon,span:Math.max(2,Math.min(190,Math.round(km*10)/10)),name:label || (chosen.length === 1 ? chosen[0].name : L('Përzgjedhja','Selection'))});
  $('search').value = state.name;
  loadView();
}
function exportCsv() {
  const chosen = filterUnits(), list = chosen.length ? chosen : filteredUnits();
  const cad = state.unitLevel === 'cadastral', ev = period('evolution'), tr = period('tracker');
  const head = [L('niveli','level'),'id',L('emri','name'),...(cad ? [L('njesia_1','unit_1')] : []),L('territori_ha','territory_ha'),...ev.steps.map(s => 'evolution_'+s.label.replace(' ','_')+'_ha'),...tr.steps.map(s => 'tracker_'+s.label.replace(' ','_')+'_ha')];
  const toHa = (v,d = 2) => Math.round(v*100*10**d)/10**d;  // km² → ha
  const q = v => /[",;\n]/.test(String(v)) ? '"'+String(v).replace(/"/g,'""')+'"' : String(v);
  const lines = [head.join(',')].concat(list.map(u => [u.level === 'cadastral' ? L('niveli_2','level_2') : L('niveli_1','level_1'),u.id,u.name,...(cad ? [u.level === 'cadastral' ? munName(u.municipality) : u.name] : []),toHa(u.areaKm2,1),...u.evolution.map(v => toHa(v)),...u.tracker.map(v => toHa(v))].map(q).join(',')));
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
  $('zoneBtnText').textContent = !ms.length ? L(`Zgjidh fillimisht ${C.unit1.acc}`,`Choose ${C.unit1.the} first`) : zones.length ? short(zones) : L(`${C.unit1.Many} e plota · ${filteredUnits().length} ${C.unit2.many}`,`Whole ${C.unit1.many} · ${filteredUnits().length} ${C.unit2.many}`);
  if (!ms.length) closePicker('zone');
  // Lists are rebuilt only when their content changes, so scrolling and typing are not interrupted.
  const mq = normalize($('munFilter').value.trim());
  if (pickers.mun.key !== mq) {
    pickers.mun.key = mq;
    $('munList').innerHTML = [...units.municipalities].sort((a,b) => a.name.localeCompare(b.name,LOCALE)).filter(u => !mq || normalize(u.name).includes(mq))
      .map(u => `<label class="zone-opt" role="option"><input type="checkbox" data-mun="${u.id}"><span>${esc(u.name)}</span><small>${areaFmt(u.areaKm2)}</small></label>`).join('') || L('<div class="find-empty">Asnjë komunë me këtë emër.</div>','<div class="find-empty">No unit with this name.</div>');
  }
  const zq = normalize($('zoneFilter').value.trim()), zkey = [...MUN].sort().join('.')+'|'+zq;
  if (pickers.zone.key !== zkey) {
    pickers.zone.key = zkey;
    const groups = ms.slice().sort((a,b) => a.name.localeCompare(b.name,LOCALE)).map(m => {
      const list = units.cadastral.filter(u => u.municipality === m.id && (!zq || normalize(u.name).includes(zq))).sort((a,b) => a.name.localeCompare(b.name,LOCALE));
      if (!list.length) return '';
      return (ms.length > 1 ? `<div class="ms-group">${esc(m.name)}</div>` : '')+list.map(u => `<label class="zone-opt" role="option"><input type="checkbox" data-zone="${u.id}"><span>${esc(u.name)}</span><small>${areaFmt(u.areaKm2)}</small></label>`).join('');
    }).join('');
    $('zoneList').innerHTML = groups || L('<div class="find-empty">Asnjë zonë me këtë emër.</div>','<div class="find-empty">No zone with this name.</div>');
  }
  for (const box of $('munList').querySelectorAll('input')) box.checked = MUN.has(box.dataset.mun);
  for (const box of $('zoneList').querySelectorAll('input')) box.checked = ZONE.has(box.dataset.zone);
  // Active filter, as removable chips.
  const chips = ms.map(m => {
    const own = zones.filter(z => z.municipality === m.id);
    return L(`<button class="chip mun" data-rm-mun="${m.id}" title="Hiqe ${esc(C.unit1.acc)} nga filtri">${esc(m.name)}${own.length ? ` <span>· ${own.length} ${esc(C.unit2.many)}</span>` : ' <span>· e plotë</span>'} <span>×</span></button>`,`<button class="chip mun" data-rm-mun="${m.id}" title="Remove the ${esc(C.unit1.one)} from the filter">${esc(m.name)}${own.length ? ` <span>· ${own.length} ${esc(C.unit2.many)}</span>` : ' <span>· whole</span>'} <span>×</span></button>`)+
      own.map(z => L(`<button class="chip" data-rm-zone="${z.id}" title="Hiqe zonën nga filtri">${esc(z.name)} <span>×</span></button>`,`<button class="chip" data-rm-zone="${z.id}" title="Remove the zone from the filter">${esc(z.name)} <span>×</span></button>`)).join('');
  }).join('');
  $('activeFilter').innerHTML = chips ? chips+L('<button class="clear" data-clear>Hiq filtrin</button>','<button class="clear" data-clear>Clear filter</button>') : '';
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
  const fm = filterMask, byUnits = fm?.kind === 'units' || fm?.kind === 'aoi';
  $('filterChip').hidden = !byUnits;
  $('filterChip').title = fm?.kind === 'aoi' ? L('Hiq zonën e interesit','Remove the zone of interest') : L('Hiq filtrin e njësive','Clear the unit filter');
  if (byUnits) $('filterName').textContent = fm.label;
  const away = byUnits && fm.inside === 0;
  $('filterAway').hidden = !away;
  if (away) $('filterAwayText').innerHTML = fm.kind === 'aoi' ? L(`Zona e interesit <b>${esc(fm.label)}</b> nuk ndodhet në këtë pamje.`,`The zone of interest <b>${esc(fm.label)}</b> is not in this view.`) : L(`Filtri <b>${esc(fm.label)}</b> nuk ndodhet ${fm.circle ? 'brenda rrethit' : 'në këtë pamje'}.`,`The filter <b>${esc(fm.label)}</b> is not ${fm.circle ? 'inside the circle' : 'in this view'}.`);
}
$('filterGo').onclick = () => state.aoi ? zoomToUnits([{bbox:state.aoi.bbox}],state.aoi.name) : zoomToUnits(filterUnits());
$('filterOff').onclick = () => state.aoi ? clearAoi() : clearFilter();
$('filterChip').onclick = () => state.aoi ? clearAoi() : clearFilter();

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
const modeText = (d,unit) => !d || !d.modes.length ? L('pa përsëritje','no repeats') : d.modes.slice(0,2).map(m => fmt1(m)+unit).join(', ')+(d.modes.length > 2 ? '…' : '')+` (${d.modeCount}×)`;
const DESC_ROWS = [[L('Mesatarja','Mean'),'mean'],[L('Mediana','Median'),'median'],[L('Modusi','Mode'),'mode'],[L('Devijimi standard','Standard deviation'),'sd'],[L('Kuartili i parë (Q1)','First quartile (Q1)'),'q1'],[L('Kuartili i tretë (Q3)','Third quartile (Q3)'),'q3'],[L('Minimumi','Minimum'),'min'],[L('Maksimumi','Maximum'),'max']];
function renderZoneStatistics() {
  const z = zoneStatistics();
  if (!z) { $('descStats').innerHTML = '';$('yearTable').innerHTML = '';return; }
  const cell = (d,key,unit) => !d ? '—' : key === 'mode' ? modeText(d,unit) : fmt1(d[key])+unit;
  $('descStats').innerHTML = L(`<table class="desc"><thead><tr><th></th><th>Shtesa vjetore</th><th>Rritja vjetore</th></tr></thead><tbody>`,`<table class="desc"><thead><tr><th></th><th>Annual addition</th><th>Annual growth</th></tr></thead><tbody>`)+
    DESC_ROWS.map(([label,key]) => `<tr><td>${label}</td><td>${cell(z.add,key,' ha')}</td><td>${cell(z.rate,key,'%')}</td></tr>`).join('')+
    L(`</tbody></table><p class="note">${z.add?.n || 0} vlera vjetore · zona e analizuar: ${fmt1(z.landHa)} ha. Rritja vjetore = shtesa e vitit ndaj sipërfaqes së ndërtuar një vit më parë.</p>`,`</tbody></table><p class="note">${z.add?.n || 0} annual values · analysed area: ${fmt1(z.landHa)} ha. Annual growth = the year's addition relative to the built-up area one year earlier.</p>`);
  $('yearTable').innerHTML = L(`<table class="years"><thead><tr><th>Viti</th><th>Ndërtuar (ha)</th><th>% e zonës</th><th>Shtesa (ha)</th><th>Rritja (%)</th></tr></thead><tbody>`,`<table class="years"><thead><tr><th>Year</th><th>Built (ha)</th><th>% of area</th><th>Added (ha)</th><th>Growth (%)</th></tr></thead><tbody>`)+
    z.rows.map((r,k) => `<tr class="${k === state.index ? 'now' : ''}"><td>${esc(r.label)}</td><td>${fmt1(r.builtHa)}</td><td>${fmt2(r.share)}</td><td>${r.addHa == null ? '—' : '+'+fmt1(r.addHa)}</td><td>${r.rate == null ? '—' : '+'+fmt1(r.rate)}</td></tr>`).join('')+'</tbody></table>';
}
// ---------- Export the current view as SVG or PNG, with legend, statistics and authorship ----------
const AUTHOR = 'Rizah Murseli';
const xml = text => String(text).replace(/[&<>"']/g,ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const clip = (text,max) => text.length > max ? text.slice(0,max-1)+'…' : text;
function exportSvg() {
  if (!sample || !view || !viewStats) throw new Error(L('Harta nuk është ngarkuar ende.','The map has not loaded yet.'));
  const r = canvas.width/canvas.clientWidth;
  const S = Math.max(640,Math.round(view.size/r)), sx = S/(view.size/r), ox = view.x/r, oy = view.y/r;
  const P = 640, W = S+P, H = S;
  const crop = document.createElement('canvas');
  crop.width = crop.height = view.size;
  crop.getContext('2d').drawImage(canvas,view.x,view.y,view.size,view.size,0,0,view.size,view.size);
  let mapImage;
  try { mapImage = crop.toDataURL('image/png'); }
  catch { throw new Error(L('Harta bazë nuk lejon eksportin. Fikni "Harta OSM" dhe provoni përsëri.','The base map does not allow export. Turn off the base map and try again.')); }
  const palette = colors(), i = state.index, steps = period().steps, fm = viewStats.filter, z = zoneStatistics();
  const scope = !fm ? L('në pamje','in view') : fm.kind === 'aoi' ? L('brenda zonës së interesit','inside the zone of interest') : fm.kind === 'circle' ? L('brenda rrethit','inside the circle') : fm.circle ? L('brenda rrethit dhe filtrit','inside the circle and filter') : L('brenda filtrit','inside the filter');
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
  text(L('ATLASI URBAN · KOSOVË','URBAN ATLAS · '+C.short),9.5,'accent mono',700);
  text(clip(state.name.toUpperCase(),24),20,'',700,26);
  text(period().source,9.5,'muted mono',400,17);
  const yearColor = 'rgb('+palette[i].join(',')+')';
  y += 50;
  out += `<text x="${ax}" y="${y}" font-size="46" class="mono" style="fill:${state.mapView === 'forms' ? '#e8eef6' : yearColor}">${xml(yearOnly(steps[i].label))}</text>`;
  if (steps[i].epoch) text(steps[i].epoch,8.5,'muted',400,15);
  const spr = state.sprawl && i > 0 ? sprawlSummary() : null;
  if (spr) {
    // With the sprawl layer the map shows classes, so the legend shows them too.
    const showNow = state.sprawlMode === 'steps' && (state.sprawlShow === 'now' || state.sprawlShow === 'stage'), showYear = state.sprawlMode === 'steps' && state.sprawlShow === 'year';
    text(state.sprawlMode === 'steps' && state.sprawlShow === 'stage' ? L(`Ndërtimi i ri ${steps[0].short}–${steps[i].short}: shkalla në ${steps[i].short}`,`New construction ${steps[0].short}–${steps[i].short}: stage in ${steps[i].short}`) : showNow ? L(`Ndërtimi i ri ${steps[0].short}–${steps[i].short}: klasa në ${steps[i].short}`,`New construction ${steps[0].short}–${steps[i].short}: class in ${steps[i].short}`)
      : showYear ? L(`Shtesat e ${steps[i].short} sipas klasës`,`Additions of ${steps[i].short} by class`) : L(`Ndërtimi i ri ${steps[0].short}–${steps[i].short} sipas klasës`,`New construction ${steps[0].short}–${steps[i].short} by class`),11,'',700,26);
    const T = state.sprawlNucleus, legItems = state.sprawlMode === 'steps' && state.sprawlShow === 'stage' ? (stageNames(),[0,1,2,3,4,5].filter(k => k !== 3 || T).map(k => [STAGES[k].c,STAGES[k].t.replace(/ \(.*\)$/,'')])) : [[SPRAWL_CLASSES[0].c,SPRAWL_CLASSES[0].t],[SPRAWL_CLASSES[1].c,SPRAWL_CLASSES[1].t],[SPRAWL_SIZE[1].c,L('Kërcim < 1 ha','Leapfrog < 1 ha')],[SPRAWL_SIZE[2].c,T ? L(`Kërcim 1–${T} ha`,`Leapfrog 1–${T} ha`) : L('Kërcim ≥ 1 ha','Leapfrog ≥ 1 ha')],...(T ? [[SPRAWL_SIZE[3].c,L(`Bërthamë e re ≥ ${T} ha`,`New nucleus ≥ ${T} ha`)]] : [])];
    legItems.forEach(([c,t],k) => {
      const lx = ax+(k%2)*150, ly = y+16+Math.floor(k/2)*16;
      out += `<rect x="${lx}" y="${ly-9}" width="11" height="10" fill="rgb(${c.join(',')})"/><text x="${lx+17}" y="${ly}" font-size="9.5">${xml(t)}</text>`;
    });
    y += 16*Math.ceil(legItems.length/2);
    const bases = [[1,L('urban','urban')],[2,L('suburban','suburban')],[3,L('rural','rural')]];
    y += 17;
    out += `<text x="${ax}" y="${y}" font-size="8.5" class="muted">${xml(L(`ndërtuar në ${steps[0].short}:`,`built in ${steps[0].short}:`))}</text>`;
    const bt = spr.base[1]+spr.base[2]+spr.base[3];
    bases.forEach(([k,t],n) => { const lx = ax+86+n*84;out += `<rect x="${lx}" y="${y-8}" width="10" height="9" fill="rgb(${SPRAWL_BASE[k].join(',')})"/>`+`<text x="${lx+14}" y="${y}" font-size="8.5" class="muted">${xml(t+' '+(bt ? Math.round(spr.base[k]/bt*100) : 0)+'%')}</text>`; });
} else {
  text(L('Viti kur u identifikua ndërtimi','Year the construction was detected'),11,'',700,26);
    const bw = aw/steps.length;
    y += 8;
    steps.forEach((s,k) => { out += `<rect x="${(ax+k*bw).toFixed(1)}" y="${y}" width="${Math.max(1,bw-1).toFixed(1)}" height="10" fill="rgb(${palette[k].join(',')})" opacity="${k > i ? .3 : 1}"/>`; });
    const ticks = steps.map((_,k) => k).filter(k => steps.length <= 13 ? k%2 === 0 || k === steps.length-1 : steps[k].year%5 === 0 || k === steps.length-1);
    for (const k of ticks) out += `<text x="${(ax+k*bw+bw/2).toFixed(1)}" y="${y+22}" font-size="8" text-anchor="middle" class="muted mono">${xml(steps[k].short)}</text>`;
    y += 22;
    out += `<rect x="${ax}" y="${y+11}" width="11" height="9" fill="rgb(${palette[0].join(',')})"/>`;
    y += 19;
    out += L(`<text x="${ax+17}" y="${y}" font-size="9.5" class="muted">${xml('gri: ndërtuar deri në '+steps[0].label.toLowerCase())}</text>`,`<text x="${ax+17}" y="${y}" font-size="9.5" class="muted">${xml('grey: built by '+steps[0].label)}</text>`);
  }
  text(L('Përmbledhje','Summary'),11,'',700,26);
  if (fm?.kind === 'units') text(clip(L('Filtri: ','Filter: ')+fm.label,44),9.5,'accent',600,15);
  if (fm?.circle || fm?.kind === 'circle') text(L(`Rrethi: rreze ${number(Math.round(viewStats.lensKm*10)/10)} km`,`Circle: radius ${number(Math.round(viewStats.lensKm*10)/10)} km`),9.5,'muted',400,14);
  // A row whose label and value would collide puts the value on its own line.
  const row = (label,value) => {
    y += 17;
    out += `<text x="${ax}" y="${y}" font-size="10" class="muted">${xml(label)}</text>`;
    if (label.length*5.1+value.length*6.4 > aw-8) y += 14;
    out += `<text x="${aRight}" y="${y}" font-size="10.5" text-anchor="end" class="mono">${xml(value)}</text>`;
  };
  const cur = z.rows[i], base = z.rows[0];
  row(L('Zona e analizuar','Analysed area'),fmt1(z.landHa)+' ha');
  row(L(`Ndërtuar ${scope}, ${steps[i].short}`,`Built ${scope}, ${steps[i].short}`),`${fmt1(cur.builtHa)} ha · ${fmt2(cur.share)}%`);
  row(L(`Ndërtuar në ${steps[0].label.toLowerCase()}`,`Built in ${steps[0].label}`),`${fmt1(base.builtHa)} ha · ${fmt2(base.share)}%`);
  if (i > 0) row(L('Rritja nga gjendja fillestare','Growth since the baseline'),`+${fmt1(cur.builtHa-base.builtHa)} ha · +${base.builtHa > 0 ? fmt1((cur.builtHa/base.builtHa-1)*100) : '—'}%`);
  if (state.radial && viewStats.radial) {
    const dirs = viewStats.radial.map(d => d.reduce((a,band) => a+band.slice(2,i+2).reduce((p,q) => p+q,0),0)*100);
    row(L('Shtesat sipas drejtimit (ha)','Additions by direction (ha)'),DIRS.map((d,k) => d[0]+' '+fmt1(dirs[k])).join(' · '));
  }
  const yA = y;
  // Column B (top right): descriptive statistics of the yearly series.
  const bx = ax+aw+30, bRight = S+P-22;
  y = 36;
  text(L('Statistikat përshkruese','Descriptive statistics'),11,'',700,0,bx);
  text(L(`${steps[1].short}–${steps[i].short} · ${Math.max(0,i)} vlera vjetore`,`${steps[1].short}–${steps[i].short} · ${Math.max(0,i)} annual values`),8.5,'muted',400,14,bx);
  const zi = {add:describe(z.rows.slice(1,i+1).map(r => r.addHa),1),rate:describe(z.rows.slice(1,i+1).map(r => r.rate),1)};
  const c1 = bx+180, c2 = bRight;
  y += 20;
  out += L(`<text x="${c1}" y="${y}" font-size="8.5" text-anchor="end" class="muted">Shtesa vjetore</text><text x="${c2}" y="${y}" font-size="8.5" text-anchor="end" class="muted">Rritja vjetore</text>`,`<text x="${c1}" y="${y}" font-size="8.5" text-anchor="end" class="muted">Annual addition</text><text x="${c2}" y="${y}" font-size="8.5" text-anchor="end" class="muted">Annual growth</text>`);
  for (const [label,key] of DESC_ROWS) {
    y += 16;
    const v = (d,unit) => !d ? '—' : key === 'mode' ? modeText(d,unit) : fmt1(d[key])+unit;
    out += `<text x="${bx}" y="${y}" font-size="9.5" class="muted">${xml(label)}</text><text x="${c1}" y="${y}" font-size="9.5" text-anchor="end" class="mono">${xml(v(zi.add,' ha'))}</text><text x="${c2}" y="${y}" font-size="9.5" text-anchor="end" class="mono">${xml(v(zi.rate,'%'))}</text>`;
  }
  y += 14;
  out += L(`<text x="${bx}" y="${y}" font-size="8" class="muted">Rritja vjetore = shtesa e vitit ndaj sipërfaqes</text><text x="${bx}" y="${y+11}" font-size="8" class="muted">së ndërtuar një vit më parë.</text>`,`<text x="${bx}" y="${y}" font-size="8" class="muted">Annual growth = the year's addition relative to</text><text x="${bx}" y="${y+11}" font-size="8" class="muted">the built-up area one year earlier.</text>`);
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
  if (spr) {
    text(L('Zgjerimi i shpërndarë (Urban Sprawl)','Urban sprawl'),11,'',700,0,bx);
    y += 24;
    out += `<text x="${bx}" y="${y}" font-size="22" class="mono" style="fill:#ffb000">${xml(spr.share == null ? '—' : fmt1(spr.share)+'%')}</text>`;
    out += `<text x="${bx+92}" y="${y-9}" font-size="8.5" class="muted">${xml(L('e ndërtimit të ri është sprawl','of new construction is sprawl'))}</text><text x="${bx+92}" y="${y+2}" font-size="8.5" class="muted">${xml(L(`(kërcim): ${fmtHa(spr.spr)} nga ${fmtHa(spr.total)} ha`,`(leapfrog): ${fmtHa(spr.spr)} of ${fmtHa(spr.total)} ha`))}</text>`;
    if (state.sprawlMode === 'steps' && sprawlRes?.now) {
      const nt = sprawlRes.now[10]+sprawlRes.now[11]+sprawlRes.now[12]+sprawlRes.now[13];
      y += 14;
      out += `<text x="${bx}" y="${y}" font-size="8.5" class="muted">${xml(L(`kur u ndërtua · klasa aktuale në ${steps[i].short}: ${nt ? fmt1((sprawlRes.now[12]+sprawlRes.now[13])/nt*100) : '—'}% sprawl`,`when built · current class in ${steps[i].short}: ${nt ? fmt1((sprawlRes.now[12]+sprawlRes.now[13])/nt*100) : '—'}% sprawl`))}</text>`;
    }
    y += 10;
    let bxp = bx;
    const bwid = bRight-bx;
    for (const c of spr.rows) { const wpx = c.pct/100*bwid;if (wpx > 0) out += `<rect x="${bxp.toFixed(1)}" y="${y}" width="${Math.max(.5,wpx-1).toFixed(1)}" height="8" fill="rgb(${c.c.join(',')})"/>`;bxp += wpx; }
    y += 8;
    const cHa = bx+168, cPct = bx+218, cN = bRight;
    y += 15;
    out += `<text x="${cHa}" y="${y}" font-size="8" text-anchor="end" class="muted">ha</text><text x="${cPct}" y="${y}" font-size="8" text-anchor="end" class="muted">%</text><text x="${cN}" y="${y}" font-size="8" text-anchor="end" class="muted">${xml(L('copa','patches'))}</text>`;
    for (const c of spr.rows) {
      y += 13;
      out += `<rect x="${bx}" y="${y-8}" width="9" height="9" fill="rgb(${c.c.join(',')})"/><text x="${bx+14}" y="${y}" font-size="9.5"${c.sprawl ? ' font-weight="700"' : ''}>${xml(c.t)}</text>`;
      out += `<text x="${cHa}" y="${y}" font-size="9.5" text-anchor="end" class="mono">${xml(fmtHa(c.ha))}</text><text x="${cPct}" y="${y}" font-size="9.5" text-anchor="end" class="mono">${xml(fmt1(c.pct))}</text><text x="${cN}" y="${y}" font-size="9.5" text-anchor="end" class="mono">${xml(number(c.n))}</text>`;
    }
    y += 13;
    out += `<text x="${bx}" y="${y}" font-size="7.5" class="muted">${xml(L(`${state.sprawlMode === 'steps' ? 'hap pas hapi' : 'dy data'} · Angel et al. 2010; Wilson et al. 2003 · rezolucioni ${spr.res} m`,`${state.sprawlMode === 'steps' ? 'step by step' : 'two dates'} · Angel et al. 2010; Wilson et al. 2003 · resolution ${spr.res} m`))}</text>`;
    const g = typeof sprawlSdg === 'function' ? sprawlSdg() : null;
    if (g && g.tot) {
      y += 14;
      out += `<text x="${bx}" y="${y}" font-size="9" font-weight="700">${xml(L('SDG','SDGs'))}</text><text x="${bx+30}" y="${y}" font-size="8.5">${xml(L(`11.3 kompakt (mbushje) ${fmt1(g.pct(10))}% · skaj ${fmt1(g.pct(11))}%`,`11.3 compact (infill) ${fmt1(g.pct(10))}% · edge ${fmt1(g.pct(11))}%`))}</text>`;
      y += 12;out += `<text x="${bx+30}" y="${y}" font-size="8.5">${xml(L(`kundër 11.3 · 15.3 · 2.4 (kërcim) ${fmt1(g.pct(13))}%`,`against 11.3 · 15.3 · 2.4 (leapfrog) ${fmt1(g.pct(13))}%`))}</text>`;
      const z = sprawlRes?.sizeShown;
      if (z) { y += 12;out += `<text x="${bx+30}" y="${y}" font-size="8.5" class="muted">${xml(L(`madhësia: <1 ha ${fmtHa(z.ha[1])} · grumbuj ${fmtHa(z.ha[2])} · bërthama ${fmtHa(z.ha[3])} ha`,`size: <1 ha ${fmtHa(z.ha[1])} · clusters ${fmtHa(z.ha[2])} · nuclei ${fmtHa(z.ha[3])} ha`))}</text>`; }
      if (g.muni) { y += 12;const m = g.muni;out += `<text x="${bx+30}" y="${y}" font-size="8.5" class="muted">${xml(L(`11.3.1 · ${m.name} ${SDG_T0}–${SDG_T1}: LCRPGR ${m.ratio == null ? '—' : dec(m.ratio,2)} · ${SDG_CAT[m.cat].t}`,`11.3.1 · ${m.name} ${SDG_T0}–${SDG_T1}: LCRPGR ${m.ratio == null ? '—' : dec(m.ratio,2)} · ${SDG_CAT[m.cat].t}`))}</text>`; }
    }
} else {
  text(L('Si u rrit zona e ndërtuar','How the built-up area grew'),11,'',700,0,bx);
  const times = first.builtHa > 0 ? last.builtHa/first.builtHa : null;
  const line1 = i ? L(`Nga ${steps[0].short} në ${steps[i].short}: ${label(first.builtHa)} → ${label(last.builtHa)} ha${times ? `, ${number(Math.round(times*10)/10)} herë më shumë` : ''} (+${label(last.builtHa-first.builtHa)} ha).`,`From ${steps[0].short} to ${steps[i].short}: ${label(first.builtHa)} → ${label(last.builtHa)} ha${times ? `, ${number(Math.round(times*10)/10)} times as much` : ''} (+${label(last.builtHa-first.builtHa)} ha).`) : L('Gjendja fillestare: zgjidhni një vit të mëvonshëm për të parë rritjen.','Baseline: choose a later year to see the growth.');
  const line2 = i > 1 ? L(`Kulmi: ${peak.short} me +${label(peak.addHa)} ha. `,`Peak: ${peak.short} with +${label(peak.addHa)} ha. `)+(after.length && before.length ? (splitYear ? L(`Para 1999 mesatarisht ${label(avg(before))} ha/vit, pas 1999 ${label(avg(after))} ha/vit (${avg(before) > 0 ? '×'+number(Math.round(avg(after)/avg(before)*10)/10) : ''}).`,`Before 1999 on average ${label(avg(before))} ha/yr, after 1999 ${label(avg(after))} ha/yr (${avg(before) > 0 ? '×'+number(Math.round(avg(after)/avg(before)*10)/10) : ''}).`) : L(`Gjysma e parë ${label(avg(before))} ha/vit, e dyta ${label(avg(after))} ha/vit.`,`First half ${label(avg(before))} ha/yr, second half ${label(avg(after))} ha/yr.`)) : '') : '';
  let dy = 17;
  for (const t of [line1,line2].filter(Boolean)) { for (const ln of wrap(t,54)) { text(ln,9.5,'muted',400,dy,bx);dy = 13; } dy = 17; }
  }
  const gTop = Math.max(yA,y)+30, axisW = 34, px0 = gx+axisW, pw = gRight-px0, slot = pw/m, barW = Math.max(2,slot*.66);
  const totalH = Math.round((gBottom-gTop)*.46), gap = 24;
  const aTop = gTop+52, aBottom = gTop+totalH, bTop = aBottom+gap+12, bBottom = gBottom;
  const xAt = k => px0+k*slot+(slot-barW)/2, cxAt = k => (xAt(k)+barW/2).toFixed(1);
  const vlabel = (cx,ty,t,size,extra='') => `<text x="${cx}" y="${ty}" font-size="${size}" class="mono" text-anchor="start" dominant-baseline="middle" transform="rotate(-90 ${cx} ${ty})"${extra}>${xml(t)}</text>`;
  const labelSize = Math.min(8,Math.max(5.5,barW*.8)).toFixed(1);
  const sprSeries = spr && state.sprawlMode === 'steps' && sprawlRes?.series && sprawlRes.series.length === i ? sprawlRes : null;
  const stz = spr && state.sprawlMode === 'steps' && state.sprawlShow === 'stage' && i > 0 && typeof stageSummary === 'function' ? stageSummary() : null;
  if (stz && stz.flows.slice(1,5).some(f => f.some(v => v > 0))) {
    // Stage view: where detached construction went (Sankey) and the stages over time, with the reading in one line.
    const all = stz.now.reduce((p,q) => p+q,0), det = all-stz.now[0], sh = v => det ? fmt1(v/det*100) : '—';
    const head = (stageStory(stz).match(/<p><b>(.*?)<\/b>/) || [,''])[1];
    out += `<text x="${gx}" y="${gTop+2}" font-size="10" font-weight="700" style="fill:#66e0d1">${xml(head.replace(/<[^>]+>/g,''))}</text>`;
    out += `<text x="${gx}" y="${gTop+16}" font-size="8.5" class="muted">${xml(L(`I shkëputur nga qyteti: ${fmt1(det/(all || 1)*100)}% e ndërtimit të ri (${fmtHa(det)} ha). Deri në ${steps[i].short}: u bashkua ${sh(stz.now[5])}% · bërthama/qyteza ${sh(stz.now[3]+stz.now[4])}% · mbetet i shpërndarë ${sh(stz.now[1]+stz.now[2])}%.`,`Detached from the city: ${fmt1(det/(all || 1)*100)}% of new construction (${fmtHa(det)} ha). By ${steps[i].short}: joined ${sh(stz.now[5])}% · nuclei/towns ${sh(stz.now[3]+stz.now[4])}% · still scattered ${sh(stz.now[1]+stz.now[2])}%.`))}</text>`;
    const top = gTop+30, hh = gBottom-top, wL = Math.round((gRight-gx)*.56), wR = gRight-gx-wL-24;
    out += `<text x="${gx}" y="${top+8}" font-size="9" font-weight="700">${xml(L(`Prej shkallës kur u ndërtua → shkalla në ${steps[i].short} (ha)`,`From the stage when built → stage in ${steps[i].short} (ha)`))}</text>`;
    out += sankeySvg(stz,{w:wL,h:hh-20,lx:130,rx:140,fs:9}).replace('<svg ',`<svg x="${gx}" y="${top+16}" width="${wL}" height="${hh-20}" `);
    const rx0 = gx+wL+24;
    out += `<text x="${rx0}" y="${top+8}" font-size="9" font-weight="700">${xml(L('Ndërtimi i shkëputur sipas shkallës në çdo vit (ha)','Detached construction by stage in every year (ha)'))}</text>`;
    out += stageSeriesSvg(stz).replace('<svg ',`<svg x="${rx0}" y="${top+16}" width="${wR}" height="${Math.min(hh-40,wR*.4)}" `);
    const ly = top+16+Math.min(hh-40,wR*.4)+16;
    [1,2,3,4,5].forEach((k,n) => { const lx2 = rx0, ly2 = ly+n*14;out += `<rect x="${lx2}" y="${ly2-8}" width="10" height="9" fill="rgb(${STAGES[k].c.join(',')})"/><text x="${lx2+14}" y="${ly2}" font-size="8.5">${xml(STAGES[k].t)}</text>`; });
  } else   if (sprSeries) {
    // With the sprawl layer: the yearly additions split by class (ha), and where the leapfrog and ribbon
    // development of each year stands at the year on display.
    const ser = sprSeries.series, bb = sprSeries.byBuild, keys = [10,11,12,13], col = {};
    for (const c of SPRAWL_CLASSES) col[c.k] = c.c;
    const amax2 = niceMax(Math.max(...ser.map(x => x[10]+x[11]+x[12]+x[13]),1e-6)*1.15);
    const ya2 = v => aBottom-v/amax2*(aBottom-aTop+40);
    out += L(`<text x="${gx}" y="${gTop+2}" font-size="9" font-weight="700">Shtesa e çdo viti sipas klasës (ha)</text>`,`<text x="${gx}" y="${gTop+2}" font-size="9" font-weight="700">Yearly additions by class (ha)</text>`);
    for (const t of [amax2/2,amax2]) out += `<line x1="${px0}" x2="${gRight}" y1="${ya2(t)}" y2="${ya2(t)}" stroke="#1e2a3a"/><text x="${px0-4}" y="${ya2(t)+3}" font-size="7.5" text-anchor="end" class="muted mono">${label(t)}</text>`;
    out += `<line x1="${px0}" x2="${gRight}" y1="${aBottom}" y2="${aBottom}" stroke="#34445c"/>`;
    bars.forEach((bar,k) => {
      const x0 = xAt(k).toFixed(1);
      if (k >= ser.length) { out += `<rect x="${x0}" y="${aBottom-1}" width="${barW.toFixed(1)}" height="1" fill="#2a3850"/>`;return; }
      let yy = aBottom;
      for (const c of keys) { const v = ser[k][c];if (v <= 0) continue;const h = aBottom-ya2(v);yy -= h;out += `<rect x="${x0}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(.6,h-.5).toFixed(1)}" fill="rgb(${col[c].join(',')})"/>`; }
      const tot = keys.reduce((acc,c) => acc+ser[k][c],0), sh = tot ? (ser[k][12]+ser[k][13])/tot*100 : 0;
      out += vlabel(cxAt(k),(yy-3).toFixed(1),Math.round(sh)+'%',labelSize,' style="fill:#ffcf66"');
    });
    out += `<text x="${gRight}" y="${gTop+2}" font-size="7.5" text-anchor="end" style="fill:#ffcf66">${xml(L('% mbi shtyllë = pjesa e sprawl','% above bar = sprawl share'))}</text>`;
    const yb2 = v => bBottom-v/100*(bBottom-bTop);
    out += L(`<text x="${gx}" y="${bTop-14}" font-size="9" font-weight="700">Kërcimet sipas vitit të ndërtimit: klasa në ${xml(steps[i].short)}</text>`,`<text x="${gx}" y="${bTop-14}" font-size="9" font-weight="700">Leapfrog by year built: class in ${xml(steps[i].short)}</text>`);
    for (const t of [50,100]) out += `<line x1="${px0}" x2="${gRight}" y1="${yb2(t)}" y2="${yb2(t)}" stroke="#1e2a3a"/><text x="${px0-4}" y="${yb2(t)+3}" font-size="7.5" text-anchor="end" class="muted mono">${t}%</text>`;
    out += `<line x1="${px0}" x2="${gRight}" y1="${bBottom}" y2="${bBottom}" stroke="#34445c"/>`;
    bars.forEach((bar,k) => {
      const x0 = xAt(k).toFixed(1);
      if (k < bb.length) {
        const t = bb[k][10]+bb[k][11]+bb[k][12]+bb[k][13];
        let yy = bBottom;
        if (t > 0) for (const st of [13,11,10]) { const h = bb[k][st]/t*(bBottom-bTop);if (h <= 0) continue;yy -= h;out += `<rect x="${x0}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(.6,h-.5).toFixed(1)}" fill="rgb(${col[st].join(',')})"/>`; }
      }
      out += `<text x="${cxAt(k)}" y="${bBottom+6}" font-size="${Math.min(8.5,Number(labelSize)+1).toFixed(1)}" class="muted mono" text-anchor="end" dominant-baseline="middle" transform="rotate(-90 ${cxAt(k)} ${bBottom+6})">${xml(bar.short)}</text>`;
    });
    const kx = px0, ky = bBottom+46;
    SPRAWL_CLASSES.forEach((c,n) => { out += `<rect x="${kx+n*110}" y="${ky-8}" width="10" height="9" fill="rgb(${c.c.join(',')})"/><text x="${kx+n*110+14}" y="${ky}" font-size="8" class="muted">${xml(c.t)}</text>`; });
} else {
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
  out += L(`<text x="${gx}" y="${gTop+2}" font-size="9" font-weight="700">Gjithsej e ndërtuar (ha)</text>`,`<text x="${gx}" y="${gTop+2}" font-size="9" font-weight="700">Total built-up (ha)</text>`);
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
  out += L(`<text x="${gx}" y="${bTop-14}" font-size="9" font-weight="700">Shtesa e çdo viti (ha)</text>`,`<text x="${gx}" y="${bTop-14}" font-size="9" font-weight="700">Added each year (ha)</text>`);
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
    out += L(`<line x1="${kx}" x2="${kx+16}" y1="${ky-3}" y2="${ky-3}" stroke="#66e0d1" stroke-dasharray="5 3"/><text x="${kx+20}" y="${ky}" font-size="8" class="accent">${xml('mesatarja '+label(zi.add.mean)+' ha')}</text>`,`<line x1="${kx}" x2="${kx+16}" y1="${ky-3}" y2="${ky-3}" stroke="#66e0d1" stroke-dasharray="5 3"/><text x="${kx+20}" y="${ky}" font-size="8" class="accent">${xml('mean '+label(zi.add.mean)+' ha')}</text>`)+
      L(`<line x1="${kx+112}" x2="${kx+128}" y1="${ky-3}" y2="${ky-3}" stroke="#66e0d1" stroke-dasharray="1.5 2.5"/><text x="${kx+132}" y="${ky}" font-size="8" class="accent">${xml('mediana '+label(zi.add.median)+' ha')}</text>`,`<line x1="${kx+112}" x2="${kx+128}" y1="${ky-3}" y2="${ky-3}" stroke="#66e0d1" stroke-dasharray="1.5 2.5"/><text x="${kx+132}" y="${ky}" font-size="8" class="accent">${xml('median '+label(zi.add.median)+' ha')}</text>`);
  }
  }
  // Authorship and sources across the bottom of the panel.
  y = H-62;
  out += `<line x1="${ax}" x2="${bRight}" y1="${y}" y2="${y}" stroke="#263244"/>`;
  text(L(`Autori: ${AUTHOR}`,`Author: ${AUTHOR}`),12.5,'',700,22);
  text(L('Të dhënat: DLR World Settlement Footprint (Evolution, Tracker) · Kufijtë: KOSOVAREF01','Data: DLR World Settlement Footprint (Evolution, Tracker) · Boundaries: KOSOVAREF01')+(state.basemap ? ' · '+BASEMAP_CREDIT[state.basemapSource].text : ''),8.5,'muted',400,16);
  text(L(`Kuartilet me interpolim linear; devijimi standard i mostrës; modusi mbi vlerat e rrumbullakosura në 0,1 · ${(d => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`)(new Date())}`,`Quartiles by linear interpolation; sample standard deviation; mode over values rounded to 0.1 · ${(d => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`)(new Date())}`),8,'muted',400,12);
  return {svg:out+'</svg>',width:W,height:H};
}
let viewerDownloads = null;
if (window.claude?.use) window.claude.use('downloads').then(d => { viewerDownloads = d; }).catch(() => {});
async function download(blob,name) {
  if (viewerDownloads) {
    try { await viewerDownloads.save({filename:name,data:blob});return; }
    catch (error) { if (error?.code === 'declined') return;alertExport(L('Shkarkimi nuk u lejua këtu: ','The download was not allowed here: ')+(error?.message || error?.code || ''));return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href);a.remove(); },1500);
}
const exportName = ext => `${L('atlasi-urban','urban-atlas')}-${normalize(state.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'pamja'}-${period().steps[state.index].short}.${ext}`;
async function exportView(kind) {
  try {
    const {svg,width,height} = exportSvg();
    if (kind === 'svg') return download(new Blob([svg],{type:'image/svg+xml'}),exportName('svg'));
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    await new Promise((resolve,reject) => { image.onload = resolve;image.onerror = () => reject(new Error(L('Imazhi nuk u krijua.','The image could not be created.')));image.src = url; });
    const scale = 2, out = document.createElement('canvas');
    out.width = width*scale;out.height = height*scale;
    const ctx = out.getContext('2d');
    ctx.scale(scale,scale);
    ctx.drawImage(image,0,0,width,height);
    URL.revokeObjectURL(url);
    out.toBlob(blob => blob ? download(blob,exportName('png')) : alertExport(L('PNG nuk u krijua; provoni SVG.','PNG could not be created; try SVG.')),'image/png');
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
// ---------- Time-series video: the printed-map template (exportSvg), one frame per step ----------
let videoJob = null;
function videoMime() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  for (const t of ['video/mp4;codecs=avc1.640028','video/mp4;codecs=avc1.4d0028','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}
function loadSvgImage(svg) {
  return new Promise((resolve,reject) => {
    const image = new Image(), url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    image.onload = () => { URL.revokeObjectURL(url);resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url);reject(new Error(L('Kuadri nuk u krijua.','The frame could not be created.'))); };
    image.src = url;
  });
}
// Draws step i into its own canvas at the video size.
async function videoFrame(i,W,H) {
  state.index = i;
  paint();
  if (state.sprawl) { await sprawlReady();paint(); }
  const {svg,width,height} = exportSvg();
  const image = await loadSvgImage(svg), frame = document.createElement('canvas');
  frame.width = W;frame.height = H;
  const ctx = frame.getContext('2d'), k = Math.min(W/width,H/height);
  ctx.fillStyle = '#0b111b';ctx.fillRect(0,0,W,H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image,(W-width*k)/2,(H-height*k)/2,width*k,height*k);
  return frame;
}
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
function videoUi(running) {
  document.body.classList.toggle('recording',running);
  $('videoStart').disabled = running;
  $('videoProgress').hidden = !running;
  for (const id of ['videoStep','videoSize','videoFade']) $(id).disabled = running;
  for (const b of document.querySelectorAll('[data-export]')) b.disabled = running;
}
function videoInfo() {
  const mime = videoMime(), n = sample ? count() : period().steps.length, step = Number($('videoStep').value);
  const secs = Math.round((n*step+2500)/1000);
  $('videoNote').textContent = !mime ? L('Ky shfletues nuk mund të regjistrojë video. Përdorni Chrome, Edge, Firefox ose Safari të ri.','This browser cannot record video. Use a recent Chrome, Edge, Firefox or Safari.')
    : L(`${n} kuadro · rreth ${secs} sekonda · ${/mp4/.test(mime) ? 'MP4' : 'WebM'}. Regjistrimi zgjat sa vetë videoja: mbajeni këtë skedë të hapur dhe të dukshme.`,
        `${n} frames · about ${secs} seconds · ${/mp4/.test(mime) ? 'MP4' : 'WebM'}. Recording takes as long as the video itself: keep this tab open and visible.`);
  $('videoStart').disabled = !mime || !!videoJob;
}
async function recordVideo() {
  const mime = videoMime();
  if (!mime || videoJob || !sample || !viewStats) return;
  stop();
  const job = videoJob = {cancel:false};
  const keep = state.index, n = count(), stepMs = Number($('videoStep').value), fade = $('videoFade').checked;
  videoUi(true);
  const progress = (done,label) => { $('videoBar').style.width = (done*100).toFixed(1)+'%';$('videoText').textContent = label; };
  let recorder = null;
  try {
    // Size: the export's own aspect ratio, scaled to the chosen width (even numbers for the encoder).
    const probe = exportSvg(), wantW = Number($('videoSize').value);
    const W = Math.round(wantW/2)*2, H = Math.round(W*probe.height/probe.width/2)*2;
    const out = document.createElement('canvas');
    out.width = W;out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#0b111b';ctx.fillRect(0,0,W,H);
    const stream = out.captureStream(30), chunks = [];
    recorder = new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.round(W*H*6)});
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const finished = new Promise(resolve => { recorder.onstop = resolve; });
    progress(0,L('Duke përgatitur kuadrin e parë…','Preparing the first frame…'));
    let current = await videoFrame(0,W,H);
    ctx.drawImage(current,0,0);
    recorder.start(500);
    const steps = period().steps;
    for (let i=1;i<n && !job.cancel;i++) {
      progress(i/n,`${steps[i-1].label} · ${i}/${n}`);
      const nextP = videoFrame(i,W,H), held = wait(i === 1 ? stepMs+1200 : stepMs);
      const [next] = await Promise.all([nextP,held]);
      if (job.cancel) break;
      if (fade) {
        const t0 = performance.now(), dur = Math.min(320,stepMs*.4);
        for (let t = 0;t < 1;t = (performance.now()-t0)/dur) {
          ctx.globalAlpha = 1;ctx.drawImage(current,0,0);
          ctx.globalAlpha = t;ctx.drawImage(next,0,0);
          await wait(16);
        }
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(next,0,0);
      current = next;
    }
    if (!job.cancel) { progress(1,`${steps[n-1].label} · ${n}/${n}`);await wait(stepMs+2500); }
    // A last redraw so the closing frame is certainly in the stream.
    ctx.drawImage(current,0,0);
    await wait(120);
    recorder.stop();
    await finished;
    stream.getTracks().forEach(t => t.stop());
    if (!job.cancel && chunks.length) {
      const ext = /mp4/.test(mime) ? 'mp4' : 'webm';
      const slug = normalize(state.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || L('pamja','view');
      await download(new Blob(chunks,{type:mime.split(';')[0]}),`${L('atlasi-urban','urban-atlas')}-${slug}-${state.period}-${steps[0].short}-${steps[n-1].short}.${ext}`);
    }
  } catch (error) {
    try { recorder?.state === 'recording' && recorder.stop(); } catch {}
    alertExport(error.message || L('Videoja nuk u krijua.','The video could not be created.'));
  } finally {
    videoJob = null;
    videoUi(false);
    state.index = Math.min(keep,count()-1);
    paint();
    videoInfo();
  }
}
$('videoToggle').onclick = () => {
  const open = $('videoBox').hidden;
  $('videoBox').hidden = !open;
  $('videoToggle').setAttribute('aria-expanded',String(open));
  if (open) videoInfo();
};
$('videoStep').onchange = videoInfo;
$('videoStart').onclick = recordVideo;
$('videoStop').onclick = () => { if (videoJob) { videoJob.cancel = true;$('videoText').textContent = L('Duke ndaluar…','Stopping…'); } };
// While recording, the keyboard must not move the timeline or the map.
document.addEventListener('keydown',event => { if (videoJob && !/input|select|textarea/i.test(event.target.tagName) && event.key !== 'Tab') { event.preventDefault();event.stopImmediatePropagation(); } },true);

// The "Sprawl" legend chip opens the definition card below it.
$('sdgLegend').addEventListener('click',event => { if (event.target.closest('.sdg-def-link')) { $('sprawlDef').open = true;$('sprawlDef').scrollIntoView({block:'nearest',behavior:'smooth'}); } });
$('sdgLegend').addEventListener('keydown',event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.sdg-def-link')) { event.preventDefault();event.target.click(); } });
// ---------- Urban sprawl: classification of new built-up patches at the source resolution ----------
// Angel, Parent & Civco (2010), The Fragmentation of Urban Footprints, Lincoln Institute of Land Policy:
//   built-up pixels by the share of built-up land in a 1 km² circle (urban ≥ 50 %, suburban 10–50 %, rural < 10 %);
//   fringe open space < 100 m from urban/suburban built-up; captured open space (enclosed, ≤ 200 ha);
//   new development: infill (interior open space), extension (exterior open space), leapfrog (entirely rural open space).
// Wilson et al. (2003), Remote Sensing of Environment 86: 275–285: linear branch growth.
// Self-contained so it can run in a Web Worker (built from its source) or on the main thread.
// Modes: 'steps' classifies each step's new built-up against the footprint of the step before (results kept per step);
//        'two' classifies everything new between the base step and the chosen step against the base footprint.
function sprawlEngine() {
  let gridCache = null, mem = null, stepsCache = null;
  const INF = 1e30, BIG = 1e29, R = Math.sqrt(1e6/Math.PI), FRINGE = 100, CAPTURE_M2 = 200e4;
  const LIN_MIN_M = 250, LIN_RATIO = 4, LIN_MAX_W = 100;
  function buffers(W,H) {
    const N = W*H;
    if (mem && mem.N === N && mem.W === W) return mem;
    const len = Math.max(W,H);
    mem = {N,W,H,f:new Float64Array(len),d:new Float64Array(len),v:new Int32Array(len),z:new Float64Array(len+1),colBuf:new Float64Array(32*H),
      isB:new Uint8Array(N),P:new Uint32Array((W+1)*H),zone:new Uint8Array(N),D:new Float32Array(N),lab:new Int32Array(N),stack:new Int32Array(N),
      space:new Uint8Array(N),feat:new Uint8Array(N),isN:new Uint8Array(N),shape:new Uint8Array(N)};
    return mem;
  }
  function run(job) {
    if (job.grid) gridCache = {key:job.gridKey,grid:job.grid};
    if (!gridCache || gridCache.key !== job.gridKey) throw new Error('grid');
    const grid = gridCache.grid, {W,H,dx,dy,tracker,domain,rowArea} = job, N = W*H, pixA = dx*dy, minPix = Math.min(dx,dy);
    const B = buffers(W,H), {f,d,v,z,colBuf,isB,P,zone,D,lab,stack,space,feat,isN,shape} = B;
    // Squared Euclidean distance transform with metric spacing (Felzenszwalb & Huttenlocher 2012).
    const dt1d = (n,s) => {
      let k = -1;
      for (let q=0;q<n;q++) {
        if (f[q] >= BIG) continue;
        const fq = f[q]+q*s*q*s;
        if (k < 0) { k = 0;v[0] = q;z[0] = -Infinity;z[1] = Infinity;continue; }
        let r = v[k], sq = (fq-(f[r]+r*s*r*s))/(2*s*(q-r));
        while (sq <= z[k]) { k--;r = v[k];sq = (fq-(f[r]+r*s*r*s))/(2*s*(q-r)); }
        k++;v[k] = q;z[k] = sq;z[k+1] = Infinity;
      }
      if (k < 0) { for (let q=0;q<n;q++) d[q] = INF;return; }
      k = 0;
      for (let q=0;q<n;q++) { while (z[k+1] < q*s) k++;const r = v[k], t = (q-r)*s;d[q] = t*t+f[r]; }
    };
    const edt = () => {   // distance in metres from every pixel to the nearest feat pixel, into D
      for (let x0=0;x0<W;x0+=32) {
        const nb = Math.min(32,W-x0);
        for (let y=0;y<H;y++) { const o = y*W+x0;for (let j=0;j<nb;j++) colBuf[j*H+y] = feat[o+j] ? 0 : INF; }
        for (let j=0;j<nb;j++) { const o = j*H;for (let y=0;y<H;y++) f[y] = colBuf[o+y];dt1d(H,dy);for (let y=0;y<H;y++) colBuf[o+y] = d[y]; }
        for (let y=0;y<H;y++) { const o = y*W+x0;for (let j=0;j<nb;j++) D[o+j] = colBuf[j*H+y]; }
      }
      for (let y=0;y<H;y++) { const o = y*W;for (let x=0;x<W;x++) f[x] = D[o+x];dt1d(W,dx);for (let x=0;x<W;x++) D[o+x] = Math.sqrt(d[x]); }
    };
    // Footprint of step a: density class of its built-up, fringe / rural / captured / interior space.
    const density = a => {
      for (let i=0;i<N;i++) { const c = grid[i];isB[i] = c >= 1 && c <= a ? 1 : 0; }
      for (let y=0;y<H;y++) { let s = 0;const o = y*(W+1);P[o] = 0;for (let x=0;x<W;x++) { s += isB[y*W+x];P[o+x+1] = s; } }
      const ry = Math.floor(R/dy), half = new Int32Array(2*ry+1);
      for (let k=-ry;k<=ry;k++) half[k+ry] = Math.floor(Math.sqrt(Math.max(0,R*R-(k*dy)**2))/dx);
      zone.fill(0);
      // The share is evaluated at the centre of each 30 m cell that holds built-up and given to its pixels.
      const st = Math.max(1,Math.round(30/minPix));
      for (let by=0;by<H;by+=st) for (let bx=0;bx<W;bx+=st) {
        const ye = Math.min(H,by+st), xe = Math.min(W,bx+st);
        let any = false;
        for (let y=by;y<ye && !any;y++) for (let x=bx;x<xe;x++) if (isB[y*W+x]) { any = true;break; }
        if (!any) continue;
        const cy = Math.min(H-1,by+(st>>1)), cx = Math.min(W-1,bx+(st>>1));
        let sum = 0, cnt = 0;
        for (let k=-ry;k<=ry;k++) {
          const yy = cy+k;
          if (yy < 0 || yy >= H) continue;
          const h = half[k+ry], x0 = cx-h < 0 ? 0 : cx-h, x1 = cx+h >= W ? W-1 : cx+h, o = yy*(W+1);
          sum += P[o+x1+1]-P[o+x0];cnt += x1-x0+1;
        }
        const share = sum/cnt, cl = share >= .5 ? 1 : share >= .1 ? 2 : 3;
        for (let y=by;y<ye;y++) for (let x=bx;x<xe;x++) if (isB[y*W+x]) zone[y*W+x] = cl;
      }
    };
    const prepare = a => {
      density(a);
      for (let i=0;i<N;i++) feat[i] = zone[i] === 1 || zone[i] === 2 ? 1 : 0;
      edt();
      for (let i=0;i<N;i++) space[i] = D[i] >= FRINGE ? 2 : 0;
      // Captured open space: rural-distance regions that do not reach the window edge and are ≤ 200 ha.
      lab.fill(0);
      let nlab = 0;
      const capture = [0];
      for (let s0=0;s0<N;s0++) {
        if (space[s0] !== 2 || lab[s0]) continue;
        nlab++;
        let top = 0, cnt = 0, edge = false;
        stack[top++] = s0;lab[s0] = nlab;
        while (top) {
          const i = stack[--top];cnt++;
          const x = i%W;
          if (x === 0 || i < W || x === W-1 || i >= N-W) edge = true;
          if (x > 0 && space[i-1] === 2 && !lab[i-1]) { lab[i-1] = nlab;stack[top++] = i-1; }
          if (x < W-1 && space[i+1] === 2 && !lab[i+1]) { lab[i+1] = nlab;stack[top++] = i+1; }
          if (i >= W && space[i-W] === 2 && !lab[i-W]) { lab[i-W] = nlab;stack[top++] = i-W; }
          if (i < N-W && space[i+W] === 2 && !lab[i+W]) { lab[i+W] = nlab;stack[top++] = i+W; }
        }
        capture.push(!edge && cnt*pixA <= CAPTURE_M2 ? 1 : 0);
      }
      for (let i=0;i<N;i++) if (space[i] === 2 && capture[lab[i]]) space[i] = 3;
      // Interior versus exterior fringe: within 100 m of (uncaptured) rural space is exterior.
      for (let i=0;i<N;i++) feat[i] = space[i] === 2 ? 1 : 0;
      edt();
      for (let i=0;i<N;i++) if (space[i] === 0 && D[i] <= FRINGE) space[i] = 1;
    };
    // New built-up in (a, b] against the footprint prepared for a; writes classes into out.
    const classify = (a,b,out,step,patchesOut,stats) => {
      for (let i=0;i<N;i++) { const c = grid[i];isN[i] = c > a && c <= b ? 1 : 0; }
      // Patches: 8-connected; at 10 m (Tracker) gaps of up to two pixels are bridged.
      if (tracker) {
        shape.fill(0);
        for (let y=0;y<H;y++) {
          const y0 = y > 0 ? y-1 : 0, y1 = y < H-1 ? y+1 : H-1;
          for (let x=0;x<W;x++) {
            if (!isN[y*W+x]) continue;
            const x0 = x > 0 ? x-1 : 0, x1 = x < W-1 ? x+1 : W-1;
            for (let yy=y0;yy<=y1;yy++) for (let xx=x0;xx<=x1;xx++) shape[yy*W+xx] = 1;
          }
        }
      } else shape.set(isN);
      lab.fill(0);
      let nlab = 0;
      for (let s0=0;s0<N;s0++) {
        if (!shape[s0] || lab[s0]) continue;
        nlab++;
        let top = 0;stack[top++] = s0;lab[s0] = nlab;
        while (top) {
          const i = stack[--top], x = i%W, left = x > 0, right = x < W-1, up = i >= W, down = i < N-W;
          if (left) { if (shape[i-1] && !lab[i-1]) { lab[i-1] = nlab;stack[top++] = i-1; } if (up && shape[i-W-1] && !lab[i-W-1]) { lab[i-W-1] = nlab;stack[top++] = i-W-1; } if (down && shape[i+W-1] && !lab[i+W-1]) { lab[i+W-1] = nlab;stack[top++] = i+W-1; } }
          if (right) { if (shape[i+1] && !lab[i+1]) { lab[i+1] = nlab;stack[top++] = i+1; } if (up && shape[i-W+1] && !lab[i-W+1]) { lab[i-W+1] = nlab;stack[top++] = i-W+1; } if (down && shape[i+W+1] && !lab[i+W+1]) { lab[i+W+1] = nlab;stack[top++] = i+W+1; } }
          if (up && shape[i-W] && !lab[i-W]) { lab[i-W] = nlab;stack[top++] = i-W; }
          if (down && shape[i+W] && !lab[i+W]) { lab[i+W] = nlab;stack[top++] = i+W; }
        }
      }
      if (!nlab) return;
      // Width from the distance to the patch edge: a strip of width w has a mean edge distance of about w/4.
      for (let i=0;i<N;i++) feat[i] = shape[i] ? 0 : 1;
      edt();
      const M = nlab+1;
      const nN = new Float64Array(M), nInt = new Float64Array(M), nRur = new Float64Array(M), nS = new Float64Array(M), sumD = new Float64Array(M);
      const sx = new Float64Array(M), sy = new Float64Array(M), inDom = new Float64Array(M), haDom = new Float64Array(M);
      for (let i=0;i<N;i++) {
        const l = lab[i];
        if (!l) continue;
        nS[l]++;sumD[l] += D[i];
        if (!isN[i]) continue;
        nN[l]++;
        const sp = space[i];
        if (sp === 2) nRur[l]++;else if (sp !== 1) nInt[l]++;
        const x = i%W, y = (i-x)/W;
        sx[l] += x;sy[l] += y;
        if (domain[i]) { inDom[l]++;haDom[l] += rowArea[y]/1e4; }
      }
      const cls = new Uint8Array(M);
      for (let l=1;l<M;l++) {
        if (!nN[l]) continue;
        let w = Math.max(minPix,4*(sumD[l]/nS[l]-(dx+dy)/4));
        if (tracker) w = Math.max(minPix,w-dx-dy);   // the bridging added one pixel on each side
        const L = nS[l]*pixA/Math.max(minPix,4*(sumD[l]/nS[l]-(dx+dy)/4));
        let c = nRur[l] === nN[l] ? 13 : nInt[l] === nN[l] ? 10 : 11;
        if (job.linear && (c === 13 || (c === 11 && nRur[l]/nN[l] >= .5)) && w <= LIN_MAX_W && L >= LIN_MIN_M && L/w >= LIN_RATIO) c = 12;
        cls[l] = c;
        if (inDom[l]) { stats.patches[c]++;patchesOut.push([c,haDom[l],sx[l]/nN[l],sy[l]/nN[l],Math.round(w),Math.round(L),step]); }
      }
      for (let i=0;i<N;i++) {
        if (!isN[i]) continue;
        const c = cls[lab[i]];
        out[i] = c;
        if (domain[i]) stats.ha[c] += rowArea[(i-i%W)/W]/1e4;
      }
    };
    const blank = () => ({ha:{10:0,11:0,12:0,13:0},patches:{10:0,11:0,12:0,13:0},base:{1:0,2:0,3:0}});
    const baseStats = st => { for (let i=0;i<N;i++) if (zone[i] && domain[i]) st.base[zone[i]] += rowArea[(i-i%W)/W]/1e4; };
    const out = new Uint8Array(N), patches = [];
    if (job.mode === 'steps') {
      // Every step against the footprint of the step before; out holds each pixel's class from its own step.
      // The density class of a built-up pixel can only rise over time (built-up land is never removed in WSF),
      // so the first footprint in which it is suburban (≥ 10 %) and urban (≥ 50 %) is enough to know its class at any step.
      // The same holds for the position in the footprint: once a built-up pixel is urban or suburban and has no
      // exterior open space within 100 m (interior), later growth can only keep it there.
      const byStep = [], firstSub = new Uint8Array(N).fill(255), firstUrb = new Uint8Array(N).fill(255), firstInt = new Uint8Array(N).fill(255);
      const mark = k => {
        // Distance from every pixel to exterior open space (exterior fringe or rural, not captured).
        for (let i=0;i<N;i++) feat[i] = !isB[i] && (space[i] === 1 || space[i] === 2) ? 1 : 0;
        edt();
        for (let i=0;i<N;i++) {
          const zz = zone[i];
          if (!zz) continue;
          if (zz <= 2 && firstSub[i] === 255) firstSub[i] = k;
          if (zz === 1 && firstUrb[i] === 255) firstUrb[i] = k;
          if (zz <= 2 && firstInt[i] === 255 && D[i] > FRINGE) firstInt[i] = k;   // no exterior open space within 100 m
        }
      };
      for (let k=1;k<job.n;k++) {
        const st = blank();
        prepare(k);
        mark(k);
        baseStats(st);
        classify(k,k+1,out,k,patches,st);
        byStep[k] = st;
        if (job.progress) job.progress(k,job.n);
      }
      prepare(job.n);
      mark(job.n);
      if (job.progress) job.progress(job.n,job.n);
      stepsCache = {key:job.gridKey,firstSub:firstSub.slice(),firstInt:firstInt.slice()};
      return {out,patches,byStep,firstSub,firstUrb,firstInt};
    }
    const st = blank();
    prepare(job.a);
    baseStats(st);
    classify(job.a,job.b,out,job.b-1,patches,st);
    for (let i=0;i<N;i++) if (!out[i] && zone[i]) out[i] = zone[i];
    return {out,patches,stats:st};
  }
  return run;
}

// ---------- Urban sprawl layer (toggle next to the radial diagram) ----------
state.sprawl = false;
state.sprawlMode = 'steps';   // 'steps': every step against the one before · 'two': base year against the chosen year
const SPRAWL_MAX_PX = 12e6, SPRAWL_MARGIN_KM = .7;
const SPRAWL_CLASSES = [
  {k:10,c:[79,140,255],t:L('Mbushje','Infill'),d:L('brenda hapësirës së brendshme të gjurmës urbane','inside the interior open space of the urban footprint'),sprawl:false},
  {k:11,c:[69,208,192],t:L('Zgjerim në skaj','Edge extension'),d:L('ngjitur me skajin, në hapësirën e jashtme','contiguous, in the exterior fringe'),sprawl:false},
  {k:13,c:[255,77,109],t:L('Kërcim (leapfrog)','Leapfrog'),d:L('tërësisht në hapësirë rurale, larg zonave urbane','entirely in rural open space, away from urban areas'),sprawl:true},
];
const SPRAWL_SIZE = {
  1:{c:[255,158,178],t:L('Kërcim: ndërtime të shpërndara (< 1 ha)','Leapfrog: scattered buildings (< 1 ha)')},
  2:{c:[255,77,109],t:L('Kërcim: grumbull i shkëputur','Leapfrog: detached cluster')},
  3:{c:[255,176,0],t:L('Bërthamë e re (jo sprawl)','New nucleus (not sprawl)')},
};
const stageCut = k => state.stageCuts[k];   // ha: A < cut 0 ≤ B < cut 1 ≤ C < cut 2 ≤ D
const STAGES = {
  0:{k:'K',c:[96,132,196],t:L('Rritje e qytetit (mbushje, skaj)','City growth (infill, edge)')},
  1:{k:'A',c:[255,158,178],t:L('A · ndërtime të shpërndara','A · scattered buildings')},
  2:{k:'B',c:[255,77,109],t:L('B · grumbull i shkëputur','B · detached cluster')},
  3:{k:'C',c:[255,176,0],t:L('C · bërthamë e re','C · new nucleus')},
  4:{k:'D',c:[184,132,255],t:L('D · qytezë e re','D · new town')},
  5:{k:'E',c:[69,208,192],t:L('E · u bashkua me qytetin','E · joined the city')},
};
const SPRAWL_BASE = {1:[214,220,230],2:[140,150,168],3:[84,94,112]};   // urban, suburban, rural: one neutral ramp, light = dense
const SPRAWL_DENS_NAMES = {1:L('urbane (≥ 50%)','urban (≥ 50%)'),2:L('suburbane (10–50%)','suburban (10–50%)'),3:L('rurale (< 10%)','rural (< 10%)')};
// Density class of a built-up pixel at step k (1 urban, 2 suburban, 3 rural), from the first step it reached each class.
const sprawlDens = (r,i,k) => r.firstUrb[i] <= k ? 1 : r.firstSub[i] <= k ? 2 : 3;
// Class of earlier development at the year on display: its position in that year's footprint (Angel's rules),
// never less absorbed than when it was built: sprawl → edge → infill.
const SPRAWL_RANK = {13:0,12:0,11:1,10:2};
function sprawlNow(r,i,t) {
  const orig = r.out[i];
  if (!SPRAWL_RANK.hasOwnProperty(orig)) return orig;
  const pos = r.firstSub[i] > t ? orig : r.firstInt[i] <= t ? 10 : 11;
  return SPRAWL_RANK[pos] >= SPRAWL_RANK[orig] ? pos : orig;
}
state.sprawlShow = 'stage';
state.stageCuts = [1,10,50];   // ha, configurable on the map: A < 1 · B 1–10 · C 10–50 · D ≥ 50
state.sprawlNucleus = 10;   // = stageCuts[1]: a detached structure of at least this size counts as a new nucleus, not as sprawl
const sprawlViewKey = () => `${baseOff()+1}|${baseOff()+state.index+1}|${state.sprawlShow}|${state.stageCuts.join(',')}`;   // 'now' class at the year on display · 'class' class when built · 'year' this year's additions only
let sprawlRes = null, sprawlPending = null, sprawlTimer = 0, sprawlJob = 0, sprawlWorker = null, workerGridKey = null, sprawlWaiters = [];
const sprawlLocal = sprawlEngine();
function sprawlRun(job,onProgress=sprawlProgress) {
  // A Web Worker keeps the page responsive; if the page may not start one, the same code runs here.
  if (sprawlWorker === null) {
    try {
      const src = sprawlEngine.toString()+';const run = sprawlEngine();onmessage = e => { const job = e.data;job.progress = (k,n) => postMessage({id:job.id,progress:k/n});try { const r = run(job);postMessage({id:job.id,...r},[r.out.buffer]); } catch(error) { postMessage({id:job.id,error:String(error.message || error)}); } };';
      sprawlWorker = new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
    } catch { sprawlWorker = false; }
  }
  if (!sprawlWorker) return new Promise(resolve => setTimeout(() => resolve(sprawlLocal({...job,grid:job.grid || null})),0));
  return new Promise((resolve,reject) => {
    const onMsg = e => {
      if (e.data.id !== job.id) return;
      if (e.data.progress != null) { onProgress(e.data.progress);return; }
      sprawlWorker.removeEventListener('message',onMsg);
      if (e.data.error) reject(new Error(e.data.error));else resolve(e.data);
    };
    sprawlWorker.addEventListener('message',onMsg);
    sprawlWorker.onerror = () => { sprawlWorker = false;resolve(sprawlLocal(job)); };
    const transfer = job.grid ? [job.grid.buffer] : [];
    sprawlWorker.postMessage(job,transfer);
  });
}
const mPerDegLat = lat => { const p = lat*Math.PI/180;return 111132.954-559.822*Math.cos(2*p)+1.175*Math.cos(4*p); };
const mPerDegLon = lat => { const p = lat*Math.PI/180;return 111412.84*Math.cos(p)-93.5*Math.cos(3*p); };
// The analysis window on the source pixel grid: the zone of interest, or the view, plus a margin for context.
function sprawlWindow() {
  if (!view) return null;
  const tracker = state.period === 'tracker', native = tracker ? manifest.trackerSize : manifest.evolutionSize;
  const t0 = manifest.tiles[0].bbox, dlon = (t0[2]-t0[0])/native, dlat = (t0[3]-t0[1])/native;
  const lon0 = Math.min(...manifest.tiles.map(t => t.bbox[0])), lat0 = Math.max(...manifest.tiles.map(t => t.bbox[3]));
  // The analysis window follows the filter, like the growth view: the zone of interest, the chosen units (within the
  // view), or the view.
  const fm = viewStats?.filter;
  let area = state.aoi ? state.aoi.bbox : [view.west,view.south,view.east,view.north];
  if (!state.aoi && fm?.kind === 'units' && fm.list?.length) {
    const bb = [Infinity,Infinity,-Infinity,-Infinity];
    for (const u of fm.list) for (const poly of u.polys) for (const ring of poly) for (let k=0;k<ring.length;k+=2) { const x = ring[k], y = ring[k+1];if (x < bb[0]) bb[0] = x;if (y < bb[1]) bb[1] = y;if (x > bb[2]) bb[2] = x;if (y > bb[3]) bb[3] = y; }
    area = [Math.max(bb[0],view.west),Math.max(bb[1],view.south),Math.min(bb[2],view.east),Math.min(bb[3],view.north)];
    if (!(area[2] > area[0] && area[3] > area[1])) area = [view.west,view.south,view.east,view.north];
  }
  const latc = (area[1]+area[3])/2, mLon = SPRAWL_MARGIN_KM*1000/mPerDegLon(latc), mLat = SPRAWL_MARGIN_KM*1000/mPerDegLat(latc);
  const gx0 = Math.floor((area[0]-mLon-lon0)/dlon), gx1 = Math.ceil((area[2]+mLon-lon0)/dlon);
  const gy0 = Math.floor((lat0-area[3]-mLat)/dlat), gy1 = Math.ceil((lat0-area[1]+mLat)/dlat);
  const W = gx1-gx0, H = gy1-gy0;
  return {tracker,native,dlon,dlat,lon0,lat0,gx0,gy0,W,H,west:lon0+gx0*dlon,north:lat0-gy0*dlat,east:lon0+gx1*dlon,south:lat0-gy1*dlat,
    dx:dlon*mPerDegLon(latc),dy:dlat*mPerDegLat(latc),tooBig:W*H > SPRAWL_MAX_PX,gridKey:`${state.period}|${gx0},${gy0},${W},${H}`};
}
function sprawlDomainSig() {
  const fm = viewStats?.filter;
  if (state.aoi) return 'aoi:'+state.aoi.name+state.aoi.bbox.join(',');
  return `${view.west.toFixed(5)},${view.north.toFixed(5)},${state.span}|${fm ? fm.kind+(fm.kind === 'units' ? fm.list.map(u => u.id).join('.') : '')+(fm.circle || fm.kind === 'circle' ? 'c'+RADIAL.lens : '') : 'view'}`;
}
// The key of the computation (what the worker must redo) and of the view (base and year shown).
const sprawlCalcKey = () => { const w = sprawlWindow();if (!w) return null;return state.sprawlMode === 'steps' ? `${w.gridKey}|steps|${sprawlDomainSig()}` : `${w.gridKey}|two|${baseOff()}|${state.index}|${sprawlDomainSig()}`; };
const sprawlKey = () => { const k = sprawlCalcKey();return k && `${k}#${baseOff()}|${state.index}`; };
const sprawlCurrent = () => !!sprawlRes && sprawlRes.key === sprawlCalcKey() && !sprawlRes.tooBig && !sprawlRes.error;
async function sprawlGrid(w) {
  const grid = new Uint8Array(w.W*w.H);
  const tiles = manifest.tiles.filter(t => t.bbox[2] > w.west && t.bbox[0] < w.east && t.bbox[3] > w.south && t.bbox[1] < w.north);
  for (const tile of tiles) {
    const {values,size} = await tileData(tile,w.native);
    const tx0 = Math.round((tile.bbox[0]-w.lon0)/w.dlon), ty0 = Math.round((w.lat0-tile.bbox[3])/w.dlat);
    const x0 = Math.max(w.gx0,tx0), x1 = Math.min(w.gx0+w.W,tx0+size), y0 = Math.max(w.gy0,ty0), y1 = Math.min(w.gy0+w.H,ty0+size);
    for (let gy=y0;gy<y1;gy++) {
      const src = (gy-ty0)*size, dst = (gy-w.gy0)*w.W;
      grid.set(values.subarray(src+x0-tx0,src+x1-tx0),dst+x0-w.gx0);
    }
  }
  return grid;
}
// Pixels whose statistics count: the zone of interest, the unit filter (and circle), the circle, or the view.
function sprawlDomain(w) {
  const cv = document.createElement('canvas');
  cv.width = w.W;cv.height = w.H;
  const ctx = cv.getContext('2d',{willReadFrequently:true});
  const X = lon => (lon-w.west)/w.dlon, Y = lat => (w.north-lat)/w.dlat;
  const fm = viewStats?.filter;
  ctx.fillStyle = '#fff';
  const polys = state.aoi ? state.aoi.parts.map(p => [p]) : fm?.kind === 'units' ? fm.list.flatMap(u => u.polys.map(p => [p])) : null;
  if (polys) {
    for (const group of polys) {
      ctx.beginPath();
      for (const part of group) for (const ring of part) { ctx.moveTo(X(ring[0]),Y(ring[1]));for (let i=2;i<ring.length;i+=2) ctx.lineTo(X(ring[i]),Y(ring[i+1]));ctx.closePath(); }
      ctx.fill('evenodd');
    }
  } else ctx.fillRect(X(view.west),Y(view.north),X(view.east)-X(view.west),Y(view.south)-Y(view.north));
  if (!state.aoi) {
    // Clip to the view and, with the radial diagram on, to its circle.
    ctx.globalCompositeOperation = 'destination-in';
    if (fm?.circle || fm?.kind === 'circle') {
      const cx = X((view.west+view.east)/2), cy = Y((view.north+view.south)/2), rKm = RADIAL.lens*state.span;
      ctx.beginPath();ctx.ellipse(cx,cy,rKm*1000/w.dx,rKm*1000/w.dy,0,0,Math.PI*2);ctx.fill();
    } else ctx.fillRect(X(view.west),Y(view.north),X(view.east)-X(view.west),Y(view.south)-Y(view.north));
  }
  const px = ctx.getImageData(0,0,w.W,w.H).data, dom = new Uint8Array(w.W*w.H);
  for (let i=0;i<dom.length;i++) dom[i] = px[i*4+3] > 127 ? 1 : 0;
  return dom;
}
function scheduleSprawl(now=false) {
  if (!state.sprawl || !sample) return;
  clearTimeout(sprawlTimer);
  sprawlTimer = setTimeout(computeSprawl,now ? 0 : 160);
}
async function computeSprawl() {
  const key = sprawlCalcKey();
  if (!key) return;
  if (sprawlRes?.key === key || sprawlPending === key) { if (sprawlRes?.key === key) { sprawlView();renderSprawlPanel();paint(true); } sprawlSettle();return; }
  const w = sprawlWindow();
  if (w.tooBig) { sprawlRes = {key,tooBig:true,w};renderSprawlPanel();paint(true);sprawlSettle();return; }
  if (state.sprawlMode === 'two' && state.index === 0) { sprawlRes = null;renderSprawlPanel();paint(true);sprawlSettle();return; }
  sprawlPending = key;
  const id = ++sprawlJob;
  sprawlProgress(0);
  try {
    const domain = sprawlDomain(w);
    const job = {id,mode:state.sprawlMode,n:manifest.periods[state.period].steps.length,gridKey:w.gridKey,W:w.W,H:w.H,a:baseOff()+1,b:baseOff()+state.index+1,dx:w.dx,dy:w.dy,tracker:w.tracker,domain};
    job.rowArea = new Float64Array(w.H);
    for (let y=0;y<w.H;y++) { const lat = w.north-(y+.5)*w.dlat;job.rowArea[y] = w.dlon*mPerDegLon(lat)*w.dlat*mPerDegLat(lat); }
    const grid = sprawlRes?.gridKey === w.gridKey && sprawlRes.grid ? sprawlRes.grid : await sprawlGrid(w);
    if (workerGridKey !== w.gridKey || !sprawlWorker) { job.grid = grid.slice();workerGridKey = w.gridKey; }
    if (id !== sprawlJob) return;
    const rowHa = job.rowArea.map(v => v/1e4);
    const t0 = performance.now(), r = await sprawlRun(job);
    if (id !== sprawlJob) return;
    sprawlRes = {key,w,grid,gridKey:w.gridKey,domain,mode:job.mode,...r,ms:performance.now()-t0,a:job.a,b:job.b,rowHa};
    sprawlView();
  } catch(error) {
    console.error(error);
    if (String(error.message) === 'grid') { workerGridKey = null;sprawlPending = null;return computeSprawl(); }
    sprawlRes = {key,error:error.message};
  } finally { if (id === sprawlJob) sprawlPending = null; }
  renderSprawlPanel();
  paint(true);
  sprawlSettle();
}
function sprawlProgress(p) {
  if (!state.sprawl) return;
  $('sprawlBody').innerHTML = `<p class="note sprawl-busy">${L('Duke klasifikuar copat në rezolucionin burimor…','Classifying the patches at the source resolution…')} ${p ? Math.round(p*100)+'%' : ''}</p><div class="sprawl-progress"><i style="width:${(p*100).toFixed(0)}%"></i></div>`;
}
// Statistics and map layer for the base and year on display (from the per-step results without recomputing).
function sprawlView() {
  const r = sprawlRes;
  if (!r || r.tooBig || r.error) return;
  const a = baseOff()+1, b = baseOff()+state.index+1, viewKey = sprawlViewKey();
  if (r.viewKey === viewKey) return;
  const blank = () => ({ha:{10:0,11:0,12:0,13:0},patches:{10:0,11:0,12:0,13:0},base:{1:0,2:0,3:0}});
  if (r.mode === 'steps') {
    const st = blank();
    for (let k=a;k<b;k++) { const s = r.byStep[k];if (!s) continue;for (const c of [10,11,12,13]) { st.ha[c] += s.ha[c];st.patches[c] += s.patches[c]; } }
    if (r.byStep[a]) st.base = {...r.byStep[a].base};
    r.stats = st;
    r.shown = r.patches.filter(p => p[6] >= a && p[6] < b);
    // Per year of building: class mix (ha) and, for every pixel built since the base year, its density class now.
    r.series = [];
    for (let k=a;k<b;k++) r.series.push(r.byStep[k] ? {...r.byStep[k].ha} : {10:0,11:0,12:0,13:0});
    const z4 = () => ({10:0,11:0,12:0,13:0});
    const matrix = {10:z4(),11:z4(),12:z4(),13:z4()}, byBuild = r.series.map(z4), now = z4();
    const {grid,out,domain,w} = r;
    for (let i=0;i<out.length;i++) {
      const code = grid[i];
      if (code <= a || code > b || !domain[i]) continue;
      const c = out[i];
      if (!matrix[c]) continue;
      const cur = sprawlNow(r,i,b), ha = r.rowHa[(i-i%w.W)/w.W];
      matrix[c][cur] += ha;now[cur] += ha;
      if (c >= 12) byBuild[code-a-1][cur] += ha;
    }
    r.matrix = matrix;r.byBuild = byBuild;r.now = now;
  } else { r.shown = r.patches;r.series = null; }
  sprawlSizes(r,a,b);
  if (r.mode === 'steps' && state.sprawlShow === 'stage') {
    const S = sprawlStages(r);
    if (!r.stageAtPix || r.stageAtPix.length !== r.grid.length) r.stageAtPix = new Uint8Array(r.grid.length);
    r.stageAtPix.fill(255);
    if (S) for (let j=0;j<S.M;j++) { const s2 = stageAt(S,j,b);if (s2 >= 0) r.stageAtPix[S.pix[j]] = s2; }
    for (let i=0;i<r.grid.length;i++) if (r.grid[i] > a && r.grid[i] <= b && r.stageAtPix[i] === 255) r.stageAtPix[i] = 0;   // new construction inside the base body
  }
  r.overlay = sprawlOverlay(r.w,r,a,b);
  r.viewKey = viewKey;
}
function sprawlSettle() { if (!sprawlPending) { const list = sprawlWaiters;sprawlWaiters = [];list.forEach(f => f()); } }
// Resolves when the layer matches the current year and view (used by the video export).
function sprawlReady() {
  if (!state.sprawl || !sample) return Promise.resolve();
  if (sprawlCurrent()) { sprawlView();return Promise.resolve(); }
  return new Promise(resolve => { sprawlWaiters.push(resolve);scheduleSprawl(true); });
}
function sprawlOverlay(w,r,a,b) {
  const cv = document.createElement('canvas');
  cv.width = w.W;cv.height = w.H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(w.W,w.H), px = img.data, out = r.out, grid = r.grid, dom = r.domain;
  const colors = {};
  for (const c of SPRAWL_CLASSES) colors[c.k] = c.c;
  if (r.mode === 'two') Object.assign(colors,SPRAWL_BASE);
  const show = r.mode === 'steps' ? state.sprawlShow : 'class';
  for (let i=0;i<out.length;i++) {
    const code = grid[i];
    if (!code || code > b || !dom[i]) continue;   // outside the filter the map keeps only the base-year grey, as in the growth view
    let c;
    if (r.mode === 'steps' && code <= a) c = SPRAWL_BASE[sprawlDens(r,i,show === 'now' || show === 'stage' ? b : a)];
    else if (show === 'stage') { const st = r.stageAtPix ? r.stageAtPix[i] : 255;if (st === 255) continue;c = STAGES[st].c; }
    else if (show === 'now') c = colors[sprawlNow(r,i,b)];
    else if (show === 'year' && code !== b) c = [70,82,102];
    else c = colors[out[i]];
    if (r.szc && r.szc[i] === 3 && code > a && !(show === 'year' && code !== b)) c = SPRAWL_SIZE[3].c;
    else if (c === colors[13] && r.szc && r.szc[i]) c = SPRAWL_SIZE[r.szc[i]].c;
    if (!c) continue;
    px[i*4] = c[0];px[i*4+1] = c[1];px[i*4+2] = c[2];px[i*4+3] = 255;
  }
  ctx.putImageData(img,0,0);
  return cv;
}
// Small SVG charts for the panel: 100 % stacked bars per year of building.
function sprawlStack(rows,keys,colorOf,labelOf,unit,opts={}) {
  const n = rows.length, W = 300, H = opts.h || 120, m = {l:28,r:6,t:8,b:20}, pw = W-m.l-m.r, ph = H-m.t-m.b, slot = pw/Math.max(1,n), bw = Math.max(1.5,slot*.72);
  const steps = period().steps;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="sprawl-chart" role="img">`;
  for (const t of [0,50,100]) { const y = m.t+ph-t/100*ph;svg += `<line x1="${m.l}" x2="${W-m.r}" y1="${y}" y2="${y}" stroke="#1e2a3a"/><text x="${m.l-4}" y="${y+3}" text-anchor="end" font-size="8" fill="#7f93ab">${t}%</text>`; }
  rows.forEach((row,j) => {
    const tot = keys.reduce((acc,k) => acc+(row[k] || 0),0), x = m.l+j*slot+(slot-bw)/2;
    let y = m.t+ph;
    const tip = `${steps[j+1].label}: ${number(Math.round(tot*10)/10)} ${unit}`+keys.map(k => `\n${labelOf(k)}: ${tot ? fmt1((row[k] || 0)/tot*100) : 0}%`).join('');
    if (!tot) { svg += `<rect x="${x.toFixed(1)}" y="${m.t}" width="${bw.toFixed(1)}" height="${ph}" fill="#121b28"><title>${esc(tip)}</title></rect>`;return; }
    svg += `<g><title>${esc(tip)}</title>`;
    for (const k of keys) { const h = (row[k] || 0)/tot*ph;if (h <= 0) continue;y -= h;svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(.5,h-.6).toFixed(1)}" fill="rgb(${colorOf(k).join(',')})"/>`; }
    svg += '</g>';
  });
  const ticks = rows.map((_,j) => j).filter(j => n <= 12 || (steps[j+1].year%5 === 0) || j === n-1);
  for (const j of ticks) svg += `<text x="${(m.l+j*slot+slot/2).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="8" fill="#7f93ab">${esc(steps[j+1].short)}</text>`;
  return svg+'</svg>';
}
// Drawn over the map in paint(): the classes replace the year colours of the new built-up area.
function drawSprawl() {
  const r = sprawlRes;
  if (state.mapView === 'forms') sprawlLegendHtml();
  if (!state.sprawl || !sprawlCurrent() || !r.overlay) return;
  sprawlView();
  const w = r.w, kx = view.size/(view.east-view.west), ky = view.size/(view.north-view.south);
  context.save();
  context.beginPath();context.rect(view.x,view.y,view.size,view.size);context.clip();
  context.imageSmoothingEnabled = (w.east-w.west)*kx < w.W;
  context.drawImage(r.overlay,view.x+(w.west-view.west)*kx,view.y+(view.north-w.north)*ky,(w.east-w.west)*kx,(w.north-w.south)*ky);
  context.restore();
}
const fmtHa = v => v >= 100 ? number(Math.round(v)) : fmt1(v);
function sprawlSummary() {
  const r = sprawlRes;
  if (!sprawlCurrent() || state.index === 0) return null;
  sprawlView();
  const ha = r.stats.ha, total = SPRAWL_CLASSES.reduce((a,c) => a+ha[c.k],0), spr = Math.max(0,SPRAWL_CLASSES.filter(c => c.sprawl).reduce((a,c) => a+ha[c.k],0)-(r.sizeBuilt ? r.sizeBuilt.nucBuiltLeap : 0));
  const patches = SPRAWL_CLASSES.reduce((a,c) => a+r.stats.patches[c.k],0);
  return {total,spr,share:total ? spr/total*100 : null,patches,rows:SPRAWL_CLASSES.map(c => ({...c,ha:ha[c.k],pct:total ? ha[c.k]/total*100 : 0,n:r.stats.patches[c.k],mean:r.stats.patches[c.k] ? ha[c.k]/r.stats.patches[c.k] : 0})),base:r.stats.base,res:Math.round((r.w.dx+r.w.dy)/2)};
}
function renderSprawlPanel(busy=false) {
  $('sprawlBox').hidden = !state.sprawl;
  sprawlLegendHtml();
  if (!state.sprawl) return;
  const r = sprawlRes, current = sprawlCurrent(), steps = period().steps, i = state.index;
  $('sprawlMode').value = state.sprawlMode;
  $('sprawlShow').value = state.sprawlShow;
  if (!$('sprawlCuts').contains(document.activeElement)) $('sprawlCuts').innerHTML = stageCutsHtml();
  $('sprawlShow').disabled = state.sprawlMode !== 'steps';
  $('sprawlTimeCsv').hidden = state.sprawlMode !== 'steps';
  $('sprawlMeta').textContent = `${steps[0].short} → ${steps[i].short}`;
  if (i === 0 && state.sprawlMode === 'two') { $('sprawlBody').innerHTML = `<p class="note">${L('Zgjidhni një vit pas vitit bazë: klasifikohet ndërtimi i ri ndërmjet tyre.','Choose a year after the base year: the new construction between them is classified.')}</p>`;return; }
  if (busy || (!current && !(r?.tooBig && r.key === sprawlCalcKey()) && !(r?.error && r.key === sprawlCalcKey()))) {
    if (!sprawlPending) scheduleSprawl(true); $('sprawlBody').innerHTML = `<p class="note sprawl-busy">${L('Duke klasifikuar copat në rezolucionin burimor…','Classifying the patches at the source resolution…')}</p>`;return; }
  if (r?.tooBig && r.key === sprawlCalcKey()) { $('sprawlBody').innerHTML = `<p class="note">${L(`Zona është shumë e madhe për klasifikim në rezolucionin burimor (${number(Math.round(r.w.W*r.w.H/1e6))} milionë piksela; kufiri ${SPRAWL_MAX_PX/1e6}). Zvogëloni mbulimin e hartës ose zgjidhni një zonë më të vogël.`,`The area is too large for classification at the source resolution (${number(Math.round(r.w.W*r.w.H/1e6))} million pixels; limit ${SPRAWL_MAX_PX/1e6}). Reduce the map extent or choose a smaller zone.`)}</p>`;return; }
  if (r?.error && r.key === sprawlCalcKey()) { $('sprawlBody').innerHTML = `<p class="note">${L('Klasifikimi dështoi: ','The classification failed: ')}${esc(r.error)}</p>`;return; }
  if (i === 0) { $('sprawlBody').innerHTML = sprawlDensHtml(true);return; }
  const s = sprawlSummary();
  if (!s) return;
  const bar = s.rows.map(c => `<i style="width:${c.pct.toFixed(2)}%;background:rgb(${c.c.join(',')})" title="${esc(c.t)}: ${fmt1(c.pct)}%"></i>`).join('');
  const baseTot = s.base[1]+s.base[2]+s.base[3];
  const modeNote = state.sprawlMode === 'steps' ? L(`Çdo hap krahasohet me gjurmën e hapit paraprak; shumat janë për ${steps[0].short}–${steps[i].short}.`,`Each step is compared with the footprint of the step before; totals cover ${steps[0].short}–${steps[i].short}.`) : L(`Krahasim me dy data: gjurma e ${steps[0].short} kundrejt ndërtimit të ri deri në ${steps[i].short}.`,`Two-date comparison: the ${steps[0].short} footprint against new construction up to ${steps[i].short}.`);
  $('sprawlBody').innerHTML = `
    <div class="sprawl-kpi"><strong>${s.share == null ? '—' : fmt1(s.share)+'%'}</strong><span>${L(`e ndërtimit të ri ${steps[0].short}–${steps[i].short} u ndërtua si <b>kërcim</b> (zhvillim i shpërndarë): ${fmtHa(s.spr)} nga ${fmtHa(s.total)} ha${state.sprawlNucleus && r.sizeBuilt?.nucBuiltLeap ? `, pa ${fmtHa(r.sizeBuilt.nucBuiltLeap)} ha kërcim që sot është pjesë e bërthamave të reja ≥ ${state.sprawlNucleus} ha` : ''}`,`of new construction ${steps[0].short}–${steps[i].short} was built as <b>leapfrog</b> (dispersed development): ${fmtHa(s.spr)} of ${fmtHa(s.total)} ha${state.sprawlNucleus && r.sizeBuilt?.nucBuiltLeap ? `, excluding ${fmtHa(r.sizeBuilt.nucBuiltLeap)} ha of leapfrog now part of new nuclei ≥ ${state.sprawlNucleus} ha` : ''}`)}</span></div>
    <div class="sprawl-bar">${bar}</div>
    <table class="sprawl-table"><thead><tr><th>${L('Klasa','Class')}</th><th>ha</th><th>%</th><th>${L('Copa','Patches')}</th><th>${L('ha/copë','ha/patch')}</th></tr></thead><tbody>
    ${s.rows.map(c => `<tr title="${esc(c.d)}"><td class="l"><i style="background:rgb(${c.c.join(',')})"></i>${esc(c.t)} </td><td>${fmtHa(c.ha)}</td><td>${fmt1(c.pct)}</td><td>${number(c.n)}</td><td>${c.n ? fmt2(c.mean) : '—'}</td></tr>`).join('')}
    <tr class="sum"><td class="l">${L('Gjithsej','Total')}</td><td>${fmtHa(s.total)}</td><td>100</td><td>${number(s.patches)}</td><td>${s.patches ? fmt2(s.total/s.patches) : '—'}</td></tr></tbody></table>
    ${state.sprawlMode === 'two' ? `<p class="note">${L(`Ndërtimi në ${steps[0].label.toLowerCase()} sipas dendësisë në rrethin 1 km²: urban ${fmtHa(s.base[1])} ha (${fmt1(baseTot ? s.base[1]/baseTot*100 : 0)}%), suburban ${fmtHa(s.base[2])} ha (${fmt1(baseTot ? s.base[2]/baseTot*100 : 0)}%), rural ${fmtHa(s.base[3])} ha (${fmt1(baseTot ? s.base[3]/baseTot*100 : 0)}%).`,`Built-up in ${steps[0].label} by density in the 1 km² circle: urban ${fmtHa(s.base[1])} ha (${fmt1(baseTot ? s.base[1]/baseTot*100 : 0)}%), suburban ${fmtHa(s.base[2])} ha (${fmt1(baseTot ? s.base[2]/baseTot*100 : 0)}%), rural ${fmtHa(s.base[3])} ha (${fmt1(baseTot ? s.base[3]/baseTot*100 : 0)}%).`)}</p>` : ''}
    ${stageHtml()}
    ${sprawlSizeHtml()}
    ${sprawlDensHtml(false)}
    ${sprawlSdgHtml()}
    ${sprawlTimeHtml(s)}
    <p class="note">${modeNote}</p>
    <p class="note">${L(`Rezolucioni i analizës: ${s.res} m (burimor) · dritarja ${number(r.w.W)} × ${number(r.w.H)} piksela · ${number(Math.round(r.ms))} ms`,`Analysis resolution: ${s.res} m (source) · window ${number(r.w.W)} × ${number(r.w.H)} pixels · ${number(Math.round(r.ms))} ms`)}</p>`;
}
function sprawlTimeHtml(s) {
  const r = sprawlRes, steps = period().steps, i = state.index;
  if (r.mode !== 'steps') return `<p class="note">${L('Ndryshimi i paternave në kohë shfaqet në mënyrën «Hap pas hapi».','Change over time is shown in the “Step by step” mode.')}</p>`;
  if (i < 1) return '';
  const classKeys = [13,11,10], col = {};
  for (const c of SPRAWL_CLASSES) col[c.k] = c;
  const sum = o => o[10]+o[11]+o[12]+o[13];
  const nowTot = sum(r.now), nowSpr = r.now[12]+r.now[13];
  const sprBuilt = sum(r.matrix[12])+sum(r.matrix[13]), sprIn = r.matrix[12][10]+r.matrix[13][10], sprEdge = r.matrix[12][11]+r.matrix[13][11], sprStill = sprBuilt-sprIn-sprEdge;
  const half = Math.max(1,Math.floor(r.series.length/2)), sh = list => { const t = list.reduce((acc,x) => acc+sum(x),0);return t ? list.reduce((acc,x) => acc+x[12]+x[13],0)/t*100 : null; };
  const early = i > 1 ? sh(r.series.slice(0,half)) : null, late = i > 1 ? sh(r.series.slice(half)) : null;
  const trend = early != null && late != null ? L(`Pjesa e kërcimeve në ndërtimin e ri: ${fmt1(early)}% në ${steps[1].short}–${steps[half].short}, ${fmt1(late)}% në ${steps[half+1].short}–${steps[i].short}.`,`Leapfrog share of new construction: ${fmt1(early)}% in ${steps[1].short}–${steps[half].short}, ${fmt1(late)}% in ${steps[half+1].short}–${steps[i].short}.`) : '';
  const pc = v => sprBuilt ? fmt1(v/sprBuilt*100) : '—';
  const fate = sprBuilt ? L(`Nga ${fmtHa(sprBuilt)} ha të ndërtuara si kërcim në ${steps[1].short}–${steps[i].short}, në ${steps[i].short} <b>${pc(sprIn)}%</b> janë tashmë brenda gjurmës (mbushje), <b>${pc(sprEdge)}%</b> në skaj dhe <b>${pc(sprStill)}%</b> mbeten sprawl.`,`Of ${fmtHa(sprBuilt)} ha built as leapfrog in ${steps[1].short}–${steps[i].short}, by ${steps[i].short} <b>${pc(sprIn)}%</b> is already inside the footprint (infill), <b>${pc(sprEdge)}%</b> at the edge and <b>${pc(sprStill)}%</b> is still dispersed.`) : '';
  const row = c => { const m = r.matrix[c.k], t = sum(m);return `<tr><td class="l"><i style="background:rgb(${c.c.join(',')})"></i>${esc(c.t)}</td>${[10,11].map(k => `<td>${t ? fmt1(m[k]/t*100) : '—'}</td>`).join('')}<td>${t ? fmt1((m[12]+m[13])/t*100) : '—'}</td><td>${fmtHa(t)}</td></tr>`; };
  return `<h4 class="sprawl-sub">${L('Si ndryshojnë paternat në kohë','How the patterns change over time')}</h4>
    <p class="note">${L(`Klasa aktuale në ${steps[i].short}: kërcim <b>${nowTot ? fmt1(nowSpr/nowTot*100) : '—'}%</b> (${fmtHa(nowSpr)} ha), skaj ${nowTot ? fmt1(r.now[11]/nowTot*100) : '—'}%, mbushje ${nowTot ? fmt1(r.now[10]/nowTot*100) : '—'}% e ndërtimit të ri. Kur u ndërtua, kërcimet ishin ${s.share == null ? '—' : fmt1(s.share)}%.`,`Current class in ${steps[i].short}: leapfrog <b>${nowTot ? fmt1(nowSpr/nowTot*100) : '—'}%</b> (${fmtHa(nowSpr)} ha), edge ${nowTot ? fmt1(r.now[11]/nowTot*100) : '—'}%, infill ${nowTot ? fmt1(r.now[10]/nowTot*100) : '—'}% of new construction. When built, leapfrog was ${s.share == null ? '—' : fmt1(s.share)}%.`)} ${trend}</p>
    ${i > 1 ? `<div class="sprawl-chart-title">${L('Përbërja e ndërtimit të ri të çdo viti (klasa kur u ndërtua)','Mix of each year\'s new construction (class when built)')}</div>
    ${sprawlStack(r.series,classKeys,k => col[k].c,k => col[k].t,'ha')}` : ''}
    <p class="note">${fate}</p>
    ${i > 1 ? `<div class="sprawl-chart-title">${L(`Kërcimet sipas vitit të ndërtimit: klasa në ${steps[i].short}`,`Leapfrog by year built: class in ${steps[i].short}`)}</div>
    ${sprawlStack(r.byBuild,classKeys,k => col[k].c,k => col[k].t,'ha')}` : ''}
    <table class="sprawl-table"><thead><tr><th>${L(`Kur u ndërtua → klasa në ${steps[i].short}`,`When built → class in ${steps[i].short}`)}</th><th>${L('mbushje %','infill %')}</th><th>${L('skaj %','edge %')}</th><th>${L('kërcim %','leapfrog %')}</th><th>ha</th></tr></thead><tbody>${SPRAWL_CLASSES.slice().reverse().map(row).join('')}</tbody></table>`;
}
function exportSprawlTimeCsv() {
  const r = sprawlRes;
  if (!sprawlCurrent() || r.mode !== 'steps' || !r.series) return;
  sprawlView();
  const steps = period().steps, i = state.index, names = {};
  for (const c of SPRAWL_CLASSES) names[c.k] = c.t;
  const t = steps[i].short;
  const head = L(['viti','mbushje_ha','zgjerim_ha','linear_ha','kercim_ha','sprawl_perqind',`kercim_shirit_ne_${t}_mbushje_ha`,`kercim_shirit_ne_${t}_skaj_ha`,`kercim_shirit_ne_${t}_ende_sprawl_ha`],
    ['year','infill_ha','extension_ha','linear_ha','leapfrog_ha','sprawl_pct',`leapfrog_ribbon_in_${t}_infill_ha`,`leapfrog_ribbon_in_${t}_edge_ha`,`leapfrog_ribbon_in_${t}_still_sprawl_ha`]);
  const r2 = v => Math.round(v*100)/100;
  const rows = r.series.map((x,j) => { const t = x[10]+x[11]+x[12]+x[13];return [steps[j+1].label,r2(x[10]),r2(x[11]),r2(x[12]),r2(x[13]),t ? r2((x[12]+x[13])/t*100) : '',r2(r.byBuild[j][10]),r2(r.byBuild[j][11]),r2(r.byBuild[j][12]+r.byBuild[j][13])]; });
  const slug = normalize(state.aoi ? state.aoi.name : state.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'zona';
  download(new Blob(['\ufeff'+[head,...rows].map(x => x.join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),`${L('sprawl-ne-kohe','sprawl-over-time')}-${slug}-${state.period}-${steps[0].short}-${steps[i].short}.csv`);
}
function exportSprawlCsv() {
  const r = sprawlRes, s = sprawlSummary();
  if (!s) return;
  const steps = period().steps, w = r.w;
  const name = {};
  for (const c of SPRAWL_CLASSES) name[c.k] = c.t;
  const raw = manifest.periods[state.period].steps;
  const head = L(['copa','klasa','sprawl','ha','gjeresia_m','gjatesia_m','lat','lon','viti_i_ndertimit','krahasuar_me','metoda','periudha'],['patch','class','sprawl','ha','width_m','length_m','lat','lon','built_in','compared_with','method','period']);
  const rows = r.shown.map((p,k) => [k+1,name[p[0]],p[0] >= 12 ? 1 : 0,Math.round(p[1]*1e4)/1e4,p[4],p[5],(w.north-(p[3]+.5)*w.dlat).toFixed(6),(w.west+(p[2]+.5)*w.dlon).toFixed(6),
    r.mode === 'steps' ? trLabel(raw[p[6]].label) : `${steps[0].label}–${steps[state.index].label}`,r.mode === 'steps' ? trLabel(raw[p[6]-1].label) : steps[0].label,r.mode === 'steps' ? L('hap pas hapi','step by step') : L('dy data','two dates'),period().source]);
  const q = v => /[",;\n]/.test(String(v)) ? '"'+String(v).replace(/"/g,'""')+'"' : String(v);
  const slug = normalize(state.aoi ? state.aoi.name : state.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'zona';
  download(new Blob(['﻿'+[head,...rows].map(r => r.map(q).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),`${L('sprawl-copat','sprawl-patches')}-${slug}-${state.period}-${steps[0].short}-${steps[state.index].short}.csv`);
}
// Map views: growth over time · forms of expansion (infill, edge, leapfrog).
state.mapView = 'time';
function setMapView(v,repaint=true) {
  state.mapView = v;
  state.sprawl = v === 'forms';
  document.body.classList.toggle('view-forms',v === 'forms');
  if (v === 'forms' && state.mode !== 'cumulative') setMode('cumulative',false);
  const hint = $('timelineHint');
  if (hint) { if (hint.dataset.time == null) hint.dataset.time = hint.textContent;
    hint.textContent = v === 'forms' ? L('Ngjyrat në hartë tregojnë formën e zgjerimit, jo vitin. Fillo nga viti bazë për të parë gjendjen fillestare. Shkurtore: ← → për vitin, hapësira për të luajtur.','Map colours show the form of expansion, not the year. Start at the base year to see the initial state. Shortcuts: ← → for the year, space to play.') : hint.dataset.time; }
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected',String(b.dataset.view === v)));
  renderSprawlPanel();
  if (v === 'forms') scheduleSprawl(true);
  if (repaint && view) { paint(true);if (sample) updateHash(); }
}
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setMapView(b.dataset.view));
$('sprawlCsv').onclick = exportSprawlCsv;
$('sprawlTimeCsv').onclick = exportSprawlTimeCsv;
$('sprawlShow').onchange = () => { state.sprawlShow = $('sprawlShow').value;sprawlLegendHtml();if (sprawlRes) sprawlRes.viewKey = null;sprawlView();renderSprawlPanel();paint(true);if (sample) updateHash(); };
function stageCutsHtml() {
  const c = state.stageCuts, inp = k => `<input type="number" inputmode="decimal" min="0.1" step="any" data-cut="${k}" value="${c[k]}" aria-label="${L('Pragu','Threshold')} ${k+1} (ha)">`;
  return `<span class="stage-cuts">A &lt; ${inp(0)} ≤ B &lt; ${inp(1)} ≤ C &lt; ${inp(2)} ≤ D <small>ha</small></span>`;
}
function setStageCuts(box) {
  const v = [...box.querySelectorAll('[data-cut]')].map(e => Number(String(e.value).replace(',','.')));
  if (!(v[0] > 0 && v[1] > v[0] && v[2] > v[1])) { box.querySelectorAll('[data-cut]').forEach((e,k) => { e.value = state.stageCuts[k];e.classList.add('bad');setTimeout(() => e.classList.remove('bad'),900); });return; }
  state.stageCuts = v;state.sprawlNucleus = v[1];
  if (sprawlRes) sprawlRes.viewKey = null;
  sprawlView();renderSprawlPanel();paint(true);if (sample) updateHash();
}
document.addEventListener('change',e => { const box = e.target.closest?.('.stage-cuts');if (box && e.target.dataset.cut != null) setStageCuts(box); });
$('sprawlMode').onchange = () => { state.sprawlMode = $('sprawlMode').value;sprawlLegendHtml();renderSprawlPanel();scheduleSprawl(true);paint(true);if (sample) updateHash(); };
function sprawlLegendHtml() {
  const focused = $('sprawlLegend').contains(document.activeElement);
  const sw = (c,t,cls='') => `<span class="${cls}"><i style="background:rgb(${c.join(',')})"></i>${esc(t)}</span>`;
  $('sprawlLegend').hidden = state.mapView === 'time';
  if (state.mapView === 'forms' && manifest && !sprawlCurrent() && !(state.sprawlMode === 'two' && state.index === 0)) {
    $('sprawlLegend').innerHTML = `<b>${L('Duke klasifikuar format për këtë pamje…','Classifying the forms for this view…')}</b>`+sw([118,130,150],L('ndërtim ende pa klasë','built-up not yet classified'),'base');return; }
  const show = state.sprawlMode === 'steps' ? state.sprawlShow : 'class';
  if (show === 'stage') {
    stageNames();
    const items = `<b>${L('Shkalla e strukturës:','Stage of the structure:')}</b>`+[0,1,2,3,4,5].map(k => sw(STAGES[k].c,STAGES[k].t)).join('');
    const base = manifest ? `<b class="leg-base">${L(`Ndërtimi i ${esc(period().steps[0].short)}:`,`Built by ${esc(period().steps[0].short)}:`)}</b>`+[1,2,3].map(k => sw(SPRAWL_BASE[k],SPRAWL_DENS_NAMES[k],'base')).join('') : '';
    const li = $('sprawlLegend').querySelector('.leg-items');
    if (focused && li) { li.innerHTML = items;$('sprawlLegend').querySelector('.leg-items2').innerHTML = base;return; }
    $('sprawlLegend').innerHTML = `<span class="leg-items">${items}</span><span class="leg-cuts"><b>${L('Pragjet:','Thresholds:')}</b> ${stageCutsHtml()}</span><span class="leg-items2">${base}</span>`;
    return;
  }
  if (focused) return;
  $('sprawlLegend').innerHTML = (show === 'now' ? `<b>${L('Klasa në vitin e zgjedhur:','Class in the chosen year:')}</b>` : show === 'class' && state.sprawlMode === 'steps' ? `<b>${L('Klasa kur u ndërtua:','Class when built:')}</b>` : '')
    +(show === 'year' ? `<b>${L('Shtesat e këtij viti:','This year\'s additions:')}</b>` : '')+SPRAWL_CLASSES.filter(c => c.k !== 13).map(c => sw(c.c,c.t)).join('')+[1,2,3].filter(k => k !== 3 || state.sprawlNucleus).map(k => sw(SPRAWL_SIZE[k].c,SPRAWL_SIZE[k].t)).join('')+(show === 'year' ? sw([70,82,102],L('vitet e mëparshme','earlier years'),'base') : '')
    +(state.sprawlMode === 'steps' && manifest ? `<b class="leg-base">${L(`Ndërtimi i ${esc(period().steps[0].short)}, dendësia në ${esc(period().steps[show === 'now' ? state.index : 0].short)}:`,`Built by ${esc(period().steps[0].short)}, density in ${esc(period().steps[show === 'now' ? state.index : 0].short)}:`)}</b>`+[1,2,3].map(k => sw(SPRAWL_BASE[k],SPRAWL_DENS_NAMES[k],'base')).join('') : '')
    +(state.sprawlMode === 'two' ? [[1,L('urban','urban')],[2,L('suburban','suburban')],[3,L('rural','rural')]].map(([k,t]) => sw(SPRAWL_BASE[k],t,'base')).join('') : '');
}
sprawlLegendHtml();
// Radial diagram in the forms view: the same bars (direction × year of building), stacked by the class shown on the map.
const SPRAWL_RADIAL_LAYERS = [10,11,13,0,131,14];   // 131: leapfrog in structures under 1 ha · 14: new nucleus
function sprawlRadial() {
  const r = sprawlRes;
  if (state.mapView !== 'forms' || !sprawlCurrent() || !view) return null;
  sprawlView();
  const key = `${r.viewKey}|${view.west},${view.north},${state.span}`;
  if (r.radialKey === key) return r.radial;
  const w = r.w, m = count()-1, off = baseOff(), b = off+state.index+1, show = r.mode === 'steps' ? state.sprawlShow : 'class';
  const stageMode = show === 'stage' && r.stageAtPix;
  r.radStage = !!stageMode;
  const rad = Array.from({length:4},() => (stageMode ? [0,1,2,3,4,5,6] : SPRAWL_RADIAL_LAYERS).map(() => new Float64Array(m)));
  const layer = {10:0,11:1,12:2,13:2,0:3,131:4,14:5};
  const cx = ((view.west+view.east)/2-w.west)/w.dlon, cy = (w.north-(view.north+view.south)/2)/w.dlat;
  const {grid,out,domain} = r;
  for (let i=0;i<grid.length;i++) {
    const code = grid[i], k = code-off-2;
    if (k < 0 || k >= m || !domain[i]) continue;
    let c;
    if (stageMode) {
      const st = code > b ? 6 : r.stageAtPix[i] === 255 ? 6 : r.stageAtPix[i];
      const x = i%w.W, y = (i-x)/w.W, ddx = (x+.5-cx)*w.dx, ddy = (y+.5-cy)*w.dy, angle = (Math.atan2(ddx,-ddy)+Math.PI*2.25)%(Math.PI*2);
      rad[Math.min(3,Math.floor(angle/(Math.PI/2)))][st][k] += r.rowHa[y]/100;
      continue;
    }
    if (code > b) c = r.mode === 'steps' ? out[i] : 0;
    else if (show === 'year' && code !== b) c = 0;
    else c = show === 'now' ? sprawlNow(r,i,b) : out[i];
    if (code <= b && r.szc && r.szc[i] === 3 && !(show === 'year' && code !== b)) c = 14;
    else if (c === 13 && code <= b && r.szc && r.szc[i] === 1) c = 131;
    const l = layer[c];
    if (l == null) continue;
    const x = i%w.W, y = (i-x)/w.W, ddx = (x+.5-cx)*w.dx, ddy = (y+.5-cy)*w.dy;
    const angle = (Math.atan2(ddx,-ddy)+Math.PI*2.25)%(Math.PI*2);
    rad[Math.min(3,Math.floor(angle/(Math.PI/2)))][l][k] += r.rowHa[y]/100;   // km², like the year diagram
  }
  r.radial = rad;r.radialKey = key;
  return rad;
}
function sprawlRadialColor(l) { if (sprawlRes?.radStage) return l === 6 ? [70,82,102] : STAGES[l].c;return l === 3 ? [70,82,102] : l === 4 ? SPRAWL_SIZE[1].c : l === 5 ? SPRAWL_SIZE[3].c : SPRAWL_CLASSES.find(c => c.k === SPRAWL_RADIAL_LAYERS[l]).c; }
function sprawlRadialName(l) { if (sprawlRes?.radStage) return l === 6 ? L('vitet në vijim','coming years') : STAGES[l].t;return l === 3 ? L('vitet e tjera','other years') : l === 4 || l === 5 ? SPRAWL_SIZE[l === 4 ? 1 : 3].t : l === 2 ? SPRAWL_SIZE[2].t : SPRAWL_CLASSES.find(c => c.k === SPRAWL_RADIAL_LAYERS[l]).t; }
// ---------- SDG reading of the forms of expansion ----------
// Infill uses land inside the existing footprint (SDG 11.3: compact, efficient urbanisation; it lowers 11.3.1).
// Edge extension adds new land, but next to the city. Leapfrog takes and fragments rural land (11.3, 15.3, 2.4)
// and lengthens trips (11.2). Population exists per municipality only, so 11.3.1 is given for the municipality.
function pointInUnit(u,lon,lat) {
  let inside = false;
  for (const poly of u.polys) for (const ring of poly) for (let i=0,j=ring.length-2;i<ring.length;j=i,i+=2) {
    const xi = ring[i], yi = ring[i+1], xj = ring[j], yj = ring[j+1];
    if ((yi > lat) !== (yj > lat) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}
function sprawlSdgMunicipality() {
  if (!units || !population || typeof sdgMetrics !== 'function') return null;
  let list = pickedMunicipalities();
  if (!list.length) {
    const [lon,lat] = state.aoi ? [(state.aoi.bbox[0]+state.aoi.bbox[2])/2,(state.aoi.bbox[1]+state.aoi.bbox[3])/2] : [state.lon,state.lat];
    const u = units.municipalities.find(m => pointInUnit(m,lon,lat));
    list = u ? [u] : [];
  }
  list = list.filter(u => u.pop && unitPop(u));
  if (!list.length) return null;
  return sdgMetrics(list,list.length === 1 ? list[0].name : filterLabel(list));
}
function sprawlSdg() {
  const r = sprawlRes, s = sprawlSummary();
  if (!s) return null;
  const useNow = r.mode === 'steps' && (state.sprawlShow === 'now' || state.sprawlShow === 'stage') && r.now;
  const v = useNow ? {10:r.now[10],11:r.now[11],13:r.now[12]+r.now[13]} : {10:s.rows[0].ha,11:s.rows[1].ha,13:s.rows[2].ha};
  const tot = v[10]+v[11]+v[13];
  const pct = k => tot ? v[k]/tot*100 : 0;
  // Per year of building (class when built): share of infill and of leapfrog.
  const series = r.mode === 'steps' && r.series ? r.series.map(x => { const t = x[10]+x[11]+x[12]+x[13];return t ? [x[10]/t*100,(x[12]+x[13])/t*100] : [null,null]; }) : null;
  return {useNow,v,tot,pct,series,muni:sprawlSdgMunicipality()};
}
function sprawlSdgChart(series) {
  const steps = period().steps, n = series.length, W = 300, H = 104, m = {l:28,r:8,t:8,b:20}, pw = W-m.l-m.r, ph = H-m.t-m.b;
  const x = j => m.l+(n === 1 ? pw/2 : j/(n-1)*pw), y = v => m.t+ph-v/100*ph;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="sprawl-chart" role="img">`;
  for (const t of [0,50,100]) svg += `<line x1="${m.l}" x2="${W-m.r}" y1="${y(t)}" y2="${y(t)}" stroke="#1e2a3a"/><text x="${m.l-4}" y="${y(t)+3}" text-anchor="end" font-size="8" fill="#7f93ab">${t}%</text>`;
  [[0,SPRAWL_CLASSES[0].c],[1,SPRAWL_CLASSES[2].c]].forEach(([s,c]) => {
    let d = '';
    series.forEach((p,j) => { if (p[s] == null) return;d += (d ? 'L' : 'M')+x(j).toFixed(1)+' '+y(p[s]).toFixed(1); });
    svg += `<path d="${d}" fill="none" stroke="rgb(${c.join(',')})" stroke-width="2" stroke-linejoin="round"/>`;
    series.forEach((p,j) => { if (p[s] != null) svg += `<circle cx="${x(j).toFixed(1)}" cy="${y(p[s]).toFixed(1)}" r="${n > 15 ? 1.6 : 2.6}" fill="rgb(${c.join(',')})" stroke="#0b1220" stroke-width="1"><title>${esc(steps[j+1].label)}: ${fmt1(p[s])}%</title></circle>`; });
  });
  const ticks = series.map((_,j) => j).filter(j => n <= 12 || Number(String(steps[j+1].short).replace(/\D/g,'').slice(-4))%5 === 0 || j === n-1);
  for (const j of ticks) svg += `<text x="${x(j).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="8" fill="#7f93ab">${esc(steps[j+1].short)}</text>`;
  return svg+'</svg>';
}
function sprawlSdgHtml() {
  const g = sprawlSdg();
  if (!g || !g.tot) return '';
  const steps = period().steps, i = state.index, C3 = SPRAWL_CLASSES;
  const when = g.useNow ? L(`klasa në ${steps[i].short}`,`class in ${steps[i].short}`) : L('klasa kur u ndërtua','class when built');
  const row = (c,k,goal,mark,txt) => `<tr><td class="l"><i style="background:rgb(${c.c.join(',')})"></i>${esc(c.t)}</td><td class="sdg-goal">${goal}</td><td>${fmtHa(g.v[k])}</td><td>${fmt1(g.pct(k))}</td><td class="sdg-mark" title="${esc(txt)}">${mark}</td></tr>`;
  const m = g.muni;
  const cat = m ? SDG_CAT[m.cat] : null;
  const muni = m ? L(`<p class="note"><b>SDG 11.3.1 · ${esc(m.name)}</b> (popullsia njihet vetëm për komunën; toka ${SDG_T0}–${SDG_T1}): LCRPGR <b style="color:${cat.c}">${m.ratio == null ? '—' : dec(m.ratio,2)}</b> · <span style="color:${cat.c}">${cat.t}</span> · toka ${sgn(m.lcr,2)} %/vit, popullsia ${sgn(m.pgr,2)} %/vit, ${int(m.m2pc)} m² e ndërtuar për banor.</p>`,
    `<p class="note"><b>SDG 11.3.1 · ${esc(m.name)}</b> (population is known for the municipality only; land ${SDG_T0}–${SDG_T1}): LCRPGR <b style="color:${cat.c}">${m.ratio == null ? '—' : dec(m.ratio,2)}</b> · <span style="color:${cat.c}">${cat.t}</span> · land ${sgn(m.lcr,2)} %/yr, population ${sgn(m.pgr,2)} %/yr, ${int(m.m2pc)} m² built up per inhabitant.</p>`) : '';
  const trend = g.series && g.series.length > 1 ? `<div class="sprawl-chart-title">${L('Në kohë, sipas vitit të ndërtimit','Over time, by year of building')}</div>
    <div class="sdg-legend"><span><i style="background:rgb(${C3[0].c.join(',')})"></i>${L('mbushje: në përputhje me 11.3','infill: in line with 11.3')}</span><span><i style="background:rgb(${C3[2].c.join(',')})"></i>${L('kërcim: kundër 11.3 dhe 15.3','leapfrog: against 11.3 and 15.3')}</span></div>${sprawlSdgChart(g.series)}` : '';
  return `<h4 class="sprawl-sub">${L('Format e zgjerimit dhe SDG','Forms of expansion and the SDGs')}</h4>
    <p class="note">${L(`Ndërtimi i ri ${steps[0].short}–${steps[i].short} (${when}), i lexuar sipas objektivave të zhvillimit të qëndrueshëm: <b>${fmt1(g.pct(10))}%</b> në përputhje me urbanizimin kompakt, <b>${fmt1(g.pct(13))}%</b> në kundërshtim.`,`New construction ${steps[0].short}–${steps[i].short} (${when}), read against the Sustainable Development Goals: <b>${fmt1(g.pct(10))}%</b> in line with compact urbanisation, <b>${fmt1(g.pct(13))}%</b> against it.`)}</p>
    <table class="sprawl-table sdg-forms"><thead><tr><th>${L('Forma','Form')}</th><th>SDG</th><th>ha</th><th>%</th><th></th></tr></thead><tbody>
    ${row(C3[0],10,'11.3 · 11.3.1','✓',L('Përdor tokë brenda gjurmës ekzistuese: dendëson qytetin dhe ul tokën e ndërtuar për banor.','Uses land inside the existing footprint: densifies the city and lowers built-up land per inhabitant.'))}
    ${row(C3[1],11,'11.3.1','◐',L('Konsumon tokë të re, por në vazhdim të qytetit, ku infrastruktura mund të zgjatet.','Consumes new land, but next to the city, where infrastructure can be extended.'))}
    ${row(C3[2],13,'11.3 · 15.3 · 2.4 · 11.2','✕',L('Merr dhe fragmenton tokë rurale e bujqësore larg qytetit dhe rrit varësinë nga automjeti.','Takes and fragments rural and farm land away from the city and increases car dependence.'))}
    </tbody></table>
    <p class="note">${L('✓ në përputhje · ◐ konsum toke në skaj · ✕ në kundërshtim. 11.3 urbanizim i qëndrueshëm · 11.3.1 toka kundrejt popullsisë · 15.3 degradimi i tokës · 2.4 toka bujqësore · 11.2 transporti.','✓ in line · ◐ land take at the edge · ✕ against. 11.3 sustainable urbanisation · 11.3.1 land versus population · 15.3 land degradation · 2.4 farmland · 11.2 transport.')}</p>
    ${trend}${muni}`;
}

// How the built-up area developed by density from the base year: urban, suburban and rural ha in every year.
function sprawlDensSeries() {
  const r = sprawlRes;
  if (!r || r.mode !== 'steps' || !r.firstUrb) return null;
  if (r.densSeries) return r.densSeries;
  const n = period().steps.length+baseOff()+1, d = [1,2,3].map(() => new Float64Array(n+2));
  const {grid,domain,w} = r;
  for (let i=0;i<grid.length;i++) {
    const c = grid[i];
    if (!c || !domain[i]) continue;
    const ha = r.rowHa[(i-i%w.W)/w.W], fs = Math.max(c,Math.min(r.firstSub[i],n+1)), fu = Math.max(c,Math.min(r.firstUrb[i],n+1));
    d[2][c] += ha;d[2][fs] -= ha;           // rural from the step it was built until it turns suburban
    d[1][fs] += ha;d[1][Math.max(fs,fu)] -= ha;
    d[0][fu] += ha;
  }
  for (const a of d) for (let k=1;k<a.length;k++) a[k] += a[k-1];
  return r.densSeries = d;
}
function sprawlDensHtml(first) {
  const d = sprawlDensSeries(), steps = period().steps, i = state.index, off = baseOff();
  if (!d) return first ? `<p class="note">${L('Gjendja fillestare sipas dendësisë shfaqet në mënyrën «Hap pas hapi».','The initial state by density is shown in the “Step by step” mode.')}</p>` : '';
  const at = k => [d[0][off+k+1],d[1][off+k+1],d[2][off+k+1]], A = at(0), B = at(i), tot = v => v[0]+v[1]+v[2];
  const pc = (v,j) => tot(v) ? fmt1(v[j]/tot(v)*100) : '—';
  const sw = k => `<i style="background:rgb(${SPRAWL_BASE[k].join(',')})"></i>`;
  // Stacked bars: built-up by density class in every year, from the base year to the last; the chosen year is marked.
  const n = steps.length, W = 300, H = 120, m = {l:34,r:6,t:8,b:20}, pw = W-m.l-m.r, ph = H-m.t-m.b, slot = pw/n, bw = Math.max(1.5,slot*.72);
  const max = niceMax(Math.max(...Array.from({length:n},(_,k) => tot(at(k))))*1.05);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="sprawl-chart" role="img">`;
  for (const t of [0,max/2,max]) { const y = m.t+ph-t/max*ph;svg += `<line x1="${m.l}" x2="${W-m.r}" y1="${y}" y2="${y}" stroke="#1e2a3a"/><text x="${m.l-4}" y="${y+3}" text-anchor="end" font-size="8" fill="#7f93ab">${fmtHa(t)}</text>`; }
  for (let k=0;k<n;k++) {
    const v = at(k), x = m.l+k*slot+(slot-bw)/2;let y = m.t+ph;
    svg += `<g opacity="${k > i ? .3 : 1}"><title>${esc(steps[k].label)}: ${[1,2,3].map(j => `${SPRAWL_DENS_NAMES[j]} ${fmtHa(v[j-1])} ha`).join(' · ')}</title>`;
    for (const j of [0,1,2]) { const h = v[j]/max*ph;if (h <= 0) continue;y -= h;svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(.5,h-.6).toFixed(1)}" fill="rgb(${SPRAWL_BASE[j+1].join(',')})"/>`; }
    svg += '</g>';
  }
  const ticks = Array.from({length:n},(_,k) => k).filter(k => n <= 12 || Number(String(steps[k].short).replace(/\D/g,'').slice(-4))%5 === 0 || k === n-1 || k === 0);
  for (const k of ticks) svg += `<text x="${(m.l+k*slot+slot/2).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="8" fill="#7f93ab">${esc(steps[k].short)}</text>`;
  svg += `<line x1="${(m.l+i*slot+slot/2).toFixed(1)}" x2="${(m.l+i*slot+slot/2).toFixed(1)}" y1="${m.t}" y2="${m.t+ph}" stroke="#fff" stroke-width="1" stroke-dasharray="2 2"/></svg>`;
  const row = j => `<tr><td class="l">${sw(j+1)}${esc(SPRAWL_DENS_NAMES[j+1])}</td><td>${fmtHa(A[j])}</td><td>${pc(A,j)}</td>${first ? '' : `<td>${fmtHa(B[j])}</td><td>${pc(B,j)}</td>`}</tr>`;
  return `<h4 class="sprawl-sub">${first ? L(`Gjendja fillestare: forma urbane në ${esc(steps[0].short)}`,`Initial state: the urban form in ${esc(steps[0].short)}`) : L('Si u zhvilluan zonat urbane','How the urban areas developed')}</h4>
    <p class="note">${first ? L(`Ndërtimi i ${esc(steps[0].short)} sipas dendësisë në rrethin 1 km² rreth çdo pikseli. Ky është pikënisja: lëvizni vitin për të parë si ndërtimi i ri mbush, zgjeron ose kërcen jashtë këtyre zonave.`,`Built-up land in ${esc(steps[0].short)} by density in the 1 km² circle around each pixel. This is the starting point: move the year to see how new construction fills, extends or leaps beyond these areas.`)
      : L(`E gjithë zona e ndërtuar sipas dendësisë, ${esc(steps[0].short)} → ${esc(steps[i].short)}: zonat urbane kalojnë nga ${fmtHa(A[0])} në ${fmtHa(B[0])} ha.`,`The whole built-up area by density, ${esc(steps[0].short)} → ${esc(steps[i].short)}: urban areas go from ${fmtHa(A[0])} to ${fmtHa(B[0])} ha.`)}</p>
    <table class="sprawl-table"><thead><tr><th>${L('Dendësia','Density')}</th><th>${esc(steps[0].short)} ha</th><th>%</th>${first ? '' : `<th>${esc(steps[i].short)} ha</th><th>%</th>`}</tr></thead><tbody>
    ${[0,1,2].map(row).join('')}<tr class="sum"><td class="l">${L('Gjithsej','Total')}</td><td>${fmtHa(tot(A))}</td><td>100</td>${first ? '' : `<td>${fmtHa(tot(B))}</td><td>100</td>`}</tr></tbody></table>
    <div class="sprawl-chart-title">${L('Zona e ndërtuar sipas dendësisë në çdo vit (ha)','Built-up area by density in every year (ha)')}</div>${svg}`;
}

// ---------- Size of detached structures: up to what size is leapfrog development sprawl? ----------
// Leapfrog pixels within 100 m of each other form one structure (the distance Angel et al. use for the fringe).
// < 1 ha: scattered buildings (Wilson et al. 2003: isolated growth) · 1 ha to the threshold: detached cluster
// (clustered branch, "clustered leapfrog") · at or above the threshold: a new nucleus. With the default 10 ha a
// structure fills at least 10 % of the 1 km² circle around it, so on its own it reaches suburban density.
function sprawlSizeNames() {
  const T = state.sprawlNucleus, c0 = number(stageCut(0));
  SPRAWL_SIZE[1].t = L(`Kërcim: ndërtime të shpërndara (< ${c0} ha)`,`Leapfrog: scattered buildings (< ${c0} ha)`);
  SPRAWL_SIZE[2].t = T ? L(`Kërcim: grumbull i shkëputur (${c0}–${T} ha)`,`Leapfrog: detached cluster (${c0}–${T} ha)`) : L('Kërcim: grumbull i shkëputur (≥ 1 ha)','Leapfrog: detached cluster (≥ 1 ha)');
  SPRAWL_SIZE[3].t = L(`Bërthamë e re ≥ ${T} ha (jo sprawl)`,`New nucleus ≥ ${T} ha (not sprawl)`);
}
function sprawlStructures(r,idx) {
  const w = r.w, W = w.W, H = w.H, n = idx.length;
  if (!r.pos) r.pos = new Int32Array(W*H).fill(-1);
  const pos = r.pos;
  for (let j=0;j<n;j++) pos[idx[j]] = j;
  const reach = 100+(w.dx+w.dy)/2, offs = [];
  for (let oy=-Math.ceil(reach/w.dy);oy<=Math.ceil(reach/w.dy);oy++) for (let ox=-Math.ceil(reach/w.dx);ox<=Math.ceil(reach/w.dx);ox++)
    if ((ox || oy) && Math.hypot(ox*w.dx,oy*w.dy) <= reach) offs.push([ox,oy]);
  const lab = new Int32Array(n), ha = [0], first = [0], stack = new Int32Array(n);
  let nl = 0;
  for (let j0=0;j0<n;j0++) {
    if (lab[j0]) continue;
    nl++;lab[j0] = nl;ha.push(0);first.push(255);
    let top = 0;stack[top++] = j0;
    while (top) {
      const j = stack[--top], p = idx[j], x = p%W, y = (p-x)/W;
      ha[nl] += r.rowHa[y];if (r.grid[p] < first[nl]) first[nl] = r.grid[p];
      for (const [ox,oy] of offs) {
        const xx = x+ox, yy = y+oy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = pos[yy*W+xx];
        if (q >= 0 && !lab[q]) { lab[q] = nl;stack[top++] = q; }
      }
    }
  }
  for (let j=0;j<n;j++) pos[idx[j]] = -1;
  return {lab,ha,first,n:nl};
}
function sprawlSizes(r,a,b) {
  sprawlSizeNames();
  const T = state.sprawlNucleus, cls = v => v < stageCut(0) ? 1 : 2;
  const {grid,out,domain} = r, N = grid.length, W = r.w.W, H = r.w.H, rowOf = p => (p-p%W)/W;
  const show = r.mode === 'steps' ? state.sprawlShow : 'class';
  if (!r.szc || r.szc.length !== N) r.szc = new Uint8Array(N); else r.szc.fill(0);
  // 1. New nuclei: structures of built-up land (new construction and base-year rural built-up, pieces at most 100 m
  //    apart) that stay more than 100 m from the urban and suburban built-up of the base year, measured on the whole
  //    structure in the chosen year, with all its later infill and edge growth. A leapfrog seed that grew to at least
  //    T ha of new construction is a new settlement, not dispersal.
  const baseUS = i => r.firstSub ? r.firstSub[i] <= a : out[i] === 1 || out[i] === 2;
  const nuc = {ha:0,n:0,list:[],builtLeap:0};
  if (T) {
    const list = [];
    for (let i=0;i<N;i++) { const c = grid[i];if (c >= 1 && c <= b && !(c <= a && baseUS(i))) list.push(i); }
    const idx = Int32Array.from(list), st = sprawlStructures(r,idx);
    const reach = 100+(r.w.dx+r.w.dy)/2, offs = [];
    for (let oy=-Math.ceil(reach/r.w.dy);oy<=Math.ceil(reach/r.w.dy);oy++) for (let ox=-Math.ceil(reach/r.w.dx);ox<=Math.ceil(reach/r.w.dx);ox++)
      if (Math.hypot(ox*r.w.dx,oy*r.w.dy) <= reach) offs.push(oy*W+ox);
    const attached = new Uint8Array(st.n+1), newHa = new Float64Array(st.n+1), first = new Uint8Array(st.n+1).fill(255), inDom = new Uint8Array(st.n+1);
    for (let j=0;j<idx.length;j++) {
      const p = idx[j], l = st.lab[j];
      if (grid[p] > a) { newHa[l] += r.rowHa[rowOf(p)];if (grid[p] < first[l]) first[l] = grid[p]; }
      if (attached[l]) continue;
      const x = p%W;
      for (const o of offs) { const q = p+o, qx = q%W;if (q < 0 || q >= N || Math.abs(qx-x) > reach/r.w.dx+1) continue;const c = grid[q];if (c >= 1 && c <= a && baseUS(q)) { attached[l] = 1;break; } }
    }
    for (let j=0;j<idx.length;j++) {
      const p = idx[j], l = st.lab[j];
      if (attached[l] || newHa[l] < T || grid[p] <= a) continue;
      r.szc[p] = 3;
      if (domain[p]) { inDom[l] = 1;nuc.ha += r.rowHa[rowOf(p)];if (out[p] === 13) nuc.builtLeap += r.rowHa[rowOf(p)]; }
    }
    for (let l=1;l<=st.n;l++) if (inDom[l]) { nuc.n++;nuc.list.push([newHa[l],first[l],1]); }
  }
  // 2. Leapfrog outside the nuclei, grouped the same way: under 1 ha scattered buildings, otherwise a detached cluster.
  const pick = now => { const list = [];for (let i=0;i<N;i++) { const c = grid[i];if (c <= a || c > b || r.szc[i] === 3) continue;if ((now ? sprawlNow(r,i,b) : out[i]) === 13) list.push(i); }return Int32Array.from(list); };
  const summarise = idx => {
    const st = sprawlStructures(r,idx), z = {ha:[0,0,0,nuc.ha],n:[0,0,0,nuc.n],list:nuc.list.slice(),nucBuiltLeap:nuc.builtLeap}, inDom = new Uint8Array(st.n+1);
    for (let j=0;j<idx.length;j++) { const p = idx[j];if (!domain[p]) continue;const l = st.lab[j];inDom[l] = 1;z.ha[cls(st.ha[l])] += r.rowHa[rowOf(p)]; }
    for (let l=1;l<=st.n;l++) if (inDom[l]) { z.n[cls(st.ha[l])]++;z.list.push([st.ha[l],st.first[l],0]); }
    z.list.sort((x,y) => y[0]-x[0]);
    return {st,idx,sum:z};
  };
  const built = summarise(pick(false));
  r.sizeBuilt = built.sum;
  const shown = (show === 'now' || show === 'stage') && r.mode === 'steps' ? summarise(pick(true)) : built;
  r.sizeShown = shown.sum;
  for (let j=0;j<shown.idx.length;j++) r.szc[shown.idx[j]] = cls(shown.st.ha[shown.st.lab[j]]);
}
function sprawlSizeHtml() {
  const r = sprawlRes, z = r?.sizeShown;
  if (!z) return '';
  const steps = period().steps, i = state.index, T = state.sprawlNucleus, tot = z.ha[1]+z.ha[2]+z.ha[3], off = baseOff();
  const when = r.mode === 'steps' && state.sprawlShow === 'now' ? L(`klasa në ${steps[i].short}`,`class in ${steps[i].short}`) : L('klasa kur u ndërtua','class when built');
  const row = k => k === 3 && !T ? '' : `<tr><td class="l"><i style="background:rgb(${SPRAWL_SIZE[k].c.join(',')})"></i>${esc(SPRAWL_SIZE[k].t)}</td><td>${number(z.n[k])}</td><td>${fmtHa(z.ha[k])}</td><td>${tot ? fmt1(z.ha[k]/tot*100) : '—'}</td></tr>`;
  const big = z.list.slice(0,6).map(([h,f,isN]) => `<li><b>${fmtHa(h)} ha</b> · ${isN ? L('bërthamë e re','new nucleus') : L('grumbull kërcimi','leapfrog cluster')} · ${L('nisi në','started in')} ${esc(steps[f-off-1]?.short || '')}</li>`).join('');
  return `<h4 class="sprawl-sub">${L('Madhësia e strukturave të shkëputura','Size of detached structures')}</h4>
    <p class="note">${L(`Ndërtimi i kërcimit (${when}) grupohet në struktura kur pjesët janë deri në 100 m larg njëra-tjetrës. ${T ? `Bërthamë e re është një strukturë e shkëputur, më shumë se 100 m larg ndërtimit urban e suburban të ${esc(steps[0].short)}, ku ndërtimi i ri, bashkë me mbushjen dhe skajin e mëvonshëm rreth saj, arrin të paktën <b>${T} ha</b>. Ajo nuk numërohet si sprawl.` : 'Pa prag: çdo strukturë e shkëputur numërohet si sprawl.'}`,`Leapfrog construction (${when}) is grouped into structures when its pieces are at most 100 m apart. ${T ? `A new nucleus is a detached structure, more than 100 m from the urban and suburban built-up of ${esc(steps[0].short)}, whose new construction, with the later infill and edge growth around it, reaches at least <b>${T} ha</b>. It is not counted as sprawl.` : 'No limit: every detached structure counts as sprawl.'}`)}</p>
    <table class="sprawl-table"><thead><tr><th>${L('Madhësia','Size')}</th><th>${L('Struktura','Structures')}</th><th>ha</th><th>%</th></tr></thead><tbody>${[1,2,3].map(row).join('')}</tbody></table>
    ${big ? `<ul class="corr-list">${big}</ul>` : ''}`;
}
// ---------- Trajectories of detached structures: A → B → C → D, or joined to the city (E) ----------
// Every built-up pixel outside the urban and suburban body of the base year belongs to a structure (pieces at most
// 100 m apart, base-year rural built-up included). Each year the structure takes the stage set by its new
// construction: A < 1 ha · B 1 ha to the nucleus threshold · C nucleus · D new town (≥ 80 ha, about 5 000
// inhabitants at Kosovo's 160 m² of built-up per inhabitant) · E within 100 m of the base-year body: joined to
// the city. Structures only grow, so the stage only moves forward. New construction that was already part of the
// body when built is city growth (K).
function stageNames() {
  const T = state.sprawlNucleus;
  const [c0,c1,c2] = state.stageCuts.map(v => number(v));
  STAGES[1].t = L(`A · ndërtime të shpërndara (< ${c0} ha)`,`A · scattered buildings (< ${c0} ha)`);
  STAGES[2].t = L(`B · grumbull i shkëputur (${c0}–${c1} ha)`,`B · detached cluster (${c0}–${c1} ha)`);
  STAGES[3].t = L(`C · bërthamë e re (${c1}–${c2} ha)`,`C · new nucleus (${c1}–${c2} ha)`);
  STAGES[4].t = L(`D · qytezë e re (≥ ${c2} ha)`,`D · new town (≥ ${c2} ha)`);
}
function sprawlStages(r) {
  if (!r || r.mode !== 'steps' || !r.firstSub) return null;
  const a = baseOff()+1, T = state.sprawlNucleus, key = `${a}|${state.stageCuts.join(',')}`;
  if (r.stages?.key === key) return r.stages;
  const t0 = performance.now(), {grid,w} = r, W = w.W, H = w.H, N = W*H, dx = w.dx, dy = w.dy, dg = Math.hypot(dx,dy);
  const baseUS = i => grid[i] >= 1 && grid[i] <= a && r.firstSub[i] <= a;
  // Distance to the base-year body (two-pass chamfer in metres).
  const dist = new Float32Array(N);
  for (let i=0;i<N;i++) dist[i] = baseUS(i) ? 0 : 1e9;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) { const i = y*W+x;let d = dist[i];if (x > 0 && dist[i-1]+dx < d) d = dist[i-1]+dx;if (y > 0) { if (dist[i-W]+dy < d) d = dist[i-W]+dy;if (x > 0 && dist[i-W-1]+dg < d) d = dist[i-W-1]+dg;if (x < W-1 && dist[i-W+1]+dg < d) d = dist[i-W+1]+dg; }dist[i] = d; }
  for (let y=H-1;y>=0;y--) for (let x=W-1;x>=0;x--) { const i = y*W+x;let d = dist[i];if (x < W-1 && dist[i+1]+dx < d) d = dist[i+1]+dx;if (y < H-1) { if (dist[i+W]+dy < d) d = dist[i+W]+dy;if (x < W-1 && dist[i+W+1]+dg < d) d = dist[i+W+1]+dg;if (x > 0 && dist[i+W-1]+dg < d) d = dist[i+W-1]+dg; }dist[i] = d; }
  let last = 0;
  const buckets = new Map();
  for (let i=0;i<N;i++) { const c = grid[i];if (!c || baseUS(i)) continue;if (c > last) last = c;const k = c <= a ? a : c;if (!buckets.has(k)) buckets.set(k,[]);buckets.get(k).push(i); }
  const M = [...buckets.values()].reduce((s,l) => s+l.length,0);
  const pix = new Int32Array(M), parent = new Int32Array(M), ha = new Float64Array(M), att = new Uint8Array(M);
  const built = new Uint8Array(M).fill(255), first = [2,3,4,5].map(() => new Uint8Array(M).fill(255));
  if (!r.pos || r.pos.length !== N) r.pos = new Int32Array(N).fill(-1);
  const pos = r.pos, reach = 100+(dx+dy)/2, offs = [];
  for (let oy=-Math.ceil(reach/dy);oy<=Math.ceil(reach/dy);oy++) for (let ox=-Math.ceil(reach/dx);ox<=Math.ceil(reach/dx);ox++)
    if ((ox || oy) && Math.hypot(ox*dx,oy*dy) <= reach && (oy < 0 || (oy === 0 && ox < 0) || true)) offs.push([ox,oy]);
  const find = j => { while (parent[j] !== j) { parent[j] = parent[parent[j]];j = parent[j]; }return j; };
  const union = (p,q) => { p = find(p);q = find(q);if (p === q) return;if (p < q) { const t = p;p = q;q = t; }parent[p] = q;ha[q] += ha[p];att[q] |= att[p]; };
  const stageOf = j => att[j] ? 5 : ha[j] < stageCut(0) ? 1 : ha[j] < stageCut(1) ? 2 : ha[j] < stageCut(2) ? 3 : 4;
  let m = 0;
  const steps = [...buckets.keys()].sort((x,y) => x-y);
  for (const t of steps) {
    const from = m;
    for (const p of buckets.get(t)) { pix[m] = p;parent[m] = m;ha[m] = grid[p] > a ? r.rowHa[(p-p%W)/W] : 0;att[m] = dist[p] <= 100 ? 1 : 0;pos[p] = m;m++; }
    for (let j=from;j<m;j++) {
      const p = pix[j], x = p%W, y = (p-x)/W;
      for (const [ox,oy] of offs) { const xx = x+ox, yy = y+oy;if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;const q = pos[yy*W+xx];if (q >= 0 && q !== j) union(j,q); }
    }
    if (t <= a) continue;
    for (let j=0;j<m;j++) {
      if (grid[pix[j]] <= a) continue;
      const s = stageOf(find(j));
      if (built[j] === 255) built[j] = s === 5 ? 0 : s;
      if (!built[j]) continue;
      if (s === 5) { if (first[3][j] === 255) first[3][j] = t; }
      else for (let k=2;k<=s;k++) if (first[k-2][j] === 255) first[k-2][j] = t;
    }
  }
  for (let j=0;j<m;j++) pos[pix[j]] = -1;
  return r.stages = {key,a,last,M:m,pix,built,first,ms:performance.now()-t0};
}
// Stage of member j at step t (0 K · 1–5 A–E), or -1 when not yet built.
function stageAt(S,j,t) {
  const p = S.pix[j], c = sprawlRes.grid[p];
  if (c <= S.a || c > t) return -1;
  if (!S.built[j]) return 0;
  for (let k=5;k>=2;k--) if (S.first[k-2][j] <= t) return k;
  return 1;
}
function stageSummary() {
  const r = sprawlRes, S = sprawlStages(r);
  if (!S) return null;
  stageNames();
  const b = baseOff()+state.index+1, dom = r.domain, W = r.w.W;
  const flows = Array.from({length:6},() => new Float64Array(6)), now = new Float64Array(6), series = [];
  for (let t=S.a+1;t<=S.last;t++) series.push(new Float64Array(6));
  for (let j=0;j<S.M;j++) {
    const p = S.pix[j];
    if (!dom[p] || r.grid[p] <= S.a) continue;
    const h = r.rowHa[(p-p%W)/W];
    for (let t=S.a+1;t<=S.last;t++) { const s = stageAt(S,j,t);if (s >= 0) series[t-S.a-1][s] += h; }
    const s = stageAt(S,j,b);
    if (s < 0) continue;
    now[s] += h;flows[S.built[j]][s] += h;
  }
  // Structures in the chosen year, with the trajectory of their seed (the earliest new construction).
  const idx = [];
  for (let j=0;j<S.M;j++) if (r.grid[S.pix[j]] <= b) idx.push(S.pix[j]);
  const st = sprawlStructures(r,Int32Array.from(idx)), seed = new Int32Array(st.n+1).fill(-1), sHa = new Float64Array(st.n+1), inDom = new Uint8Array(st.n+1);
  const jOf = new Map();
  for (let j=0;j<S.M;j++) jOf.set(S.pix[j],j);
  for (let q=0;q<idx.length;q++) {
    const p = idx[q], l = st.lab[q], j = jOf.get(p);
    if (r.grid[p] <= S.a || !S.built[j]) continue;
    sHa[l] += r.rowHa[(p-p%W)/W];if (dom[p]) inDom[l] = 1;
    if (seed[l] < 0 || r.grid[p] < r.grid[S.pix[seed[l]]]) seed[l] = j;
  }
  const traj = [];
  for (let l=1;l<=st.n;l++) {
    if (!inDom[l] || seed[l] < 0) continue;
    const j = seed[l], path = [[S.built[j],r.grid[S.pix[j]]]];
    for (let k=2;k<=5;k++) if (S.first[k-2][j] <= b && k > S.built[j]) path.push([k,S.first[k-2][j]]);
    traj.push({ha:sHa[l],path,stage:stageAt(S,j,b)});
  }
  traj.sort((x,y) => y.ha-x.ha);
  return {S,b,flows,now,series,traj};
}
function sankeySvg(z,opts={}) {
  const W = opts.w || 300, H = opts.h || 210, pad = 6, nodeW = 10, gap = 6, lx = opts.lx ?? 92, rx = W-(opts.rx ?? 104)-nodeW, fs = opts.fs || 8;
  const left = [1,2,3,4].filter(k => z.flows[k].some(v => v > 0)), right = [1,2,3,4,5].filter(k => left.some(l => z.flows[l][k] > 0));
  const tot = left.reduce((s,k) => s+z.flows[k].reduce((a,b) => a+b,0),0);
  if (!tot) return '';
  const scale = (H-2*pad-gap*(Math.max(left.length,right.length)-1))/tot;
  const lin = {}, rin = {};
  let y = pad;
  for (const k of left) { const h = z.flows[k].reduce((a,b) => a+b,0)*scale;lin[k] = {y,h,o:y};y += h+gap; }
  y = pad;
  for (const k of right) { const h = left.reduce((s,l) => s+z.flows[l][k],0)*scale;rin[k] = {y,h,o:y};y += h+gap; }
  const col = k => `rgb(${STAGES[k].c.join(',')})`, steps = period().steps;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="sprawl-chart sankey" role="img">`;
  for (const l of left) for (const k of right) {
    const v = z.flows[l][k];if (!(v > 0)) continue;
    const h = Math.max(.6,v*scale), y0 = lin[l].o, y1 = rin[k].o;lin[l].o += v*scale;rin[k].o += v*scale;
    const x0 = lx+nodeW, x1 = rx, cx = (x0+x1)/2;
    svg += `<path d="M${x0} ${y0.toFixed(1)}C${cx} ${y0.toFixed(1)} ${cx} ${y1.toFixed(1)} ${x1} ${y1.toFixed(1)}L${x1} ${(y1+h).toFixed(1)}C${cx} ${(y1+h).toFixed(1)} ${cx} ${(y0+h).toFixed(1)} ${x0} ${(y0+h).toFixed(1)}Z" fill="${col(k)}" fill-opacity=".38" stroke="#0b1220" stroke-width=".5"><title>${esc(STAGES[l].k+' → '+STAGES[k].k)}: ${fmtHa(v)} ha (${fmt1(v/tot*100)}%)</title></path>`;
  }
  const label = (x,yy,h,k,anchor,val) => `<text x="${x}" y="${(yy+h/2-1).toFixed(1)}" font-size="${fs}" fill="#e8eef6" text-anchor="${anchor}" font-weight="700">${esc(STAGES[k].t.split(' (')[0])}</text><text x="${x}" y="${(yy+h/2+fs).toFixed(1)}" font-size="${fs-.5}" fill="#9fb0c6" text-anchor="${anchor}">${fmtHa(val)} ha · ${fmt1(val/tot*100)}%</text>`;
  for (const k of left) { const n = lin[k], v = z.flows[k].reduce((a,b) => a+b,0);svg += `<rect x="${lx}" y="${n.y.toFixed(1)}" width="${nodeW}" height="${Math.max(1,n.h).toFixed(1)}" rx="2" fill="${col(k)}"/>`+label(lx-4,n.y,n.h,k,'end',v); }
  for (const k of right) { const n = rin[k], v = left.reduce((s,l) => s+z.flows[l][k],0);svg += `<rect x="${rx}" y="${n.y.toFixed(1)}" width="${nodeW}" height="${Math.max(1,n.h).toFixed(1)}" rx="2" fill="${col(k)}"/>`+label(rx+nodeW+4,n.y,n.h,k,'start',v); }
  return svg+'</svg>';
}
function stageStory(z) {
  const steps = period().steps, i = state.index, off = baseOff(), f = z.flows, yr = t => steps[t-off-1]?.short || '';
  const all = z.now.reduce((a,b) => a+b,0), city = z.now[0], det = all-city;
  if (!all) return '';
  const pc = v => fmt1(v/(det || 1)*100);
  const sprawl = z.now[1]+z.now[2], nuclei = z.now[3]+z.now[4], joined = z.now[5];
  const reachedC = z.traj.filter(t => t.path.some(([k]) => k === 3 || k === 4)), joinedT = z.traj.filter(t => t.path.some(([k]) => k === 5) && t.path[0][0] !== 5);
  const yearsTo = list => { const v = list.map(t => t.path.find(([k]) => k === 5)[1]-t.path[0][1]).sort((a,b) => a-b);return v.length ? v[Math.floor(v.length/2)] : null; };
  const med = yearsTo(joinedT);
  const firstC = reachedC.map(t => t.path.find(([k]) => k === 3 || k === 4)[1]).sort((a,b) => a-b)[0];
  const share = x => x/(det || 1);
  const nNuc = z.traj.filter(t => t.stage === 3 || t.stage === 4), big = nNuc.slice().sort((x,y) => y.ha-x.ha)[0];
  const sj = share(joined), ss = share(sprawl), sn = share(nuclei), top = Math.max(sj,ss,sn);
  let verdict = top === sj && sj >= .4 ? L('<b>Modeli kryesor është difuzion, pastaj bashkim.</b> Kërcimet hapin terrenin dhe qyteti i arrin e i përthith më vonë. Shpërndarja këtu është kryesisht fazë kalimtare e zgjerimit, siç e përshkruan teoria e valëve të rritjes urbane (Dietzel et al. 2005; Liu et al. 2010).','<b>The main pattern is diffusion, then coalescence.</b> Leapfrog development opens the ground and the city reaches and absorbs it later. Dispersal here is mostly a transitional phase of expansion, as described by the wave theory of urban growth (Dietzel et al. 2005; Liu et al. 2010).')
    : top === ss ? L('<b>Shpërndarja mbetet e qëndrueshme.</b> Pjesa më e madhe e ndërtimit të shkëputur as nuk u bashkua me qytetin, as nuk formoi bërthama: mbetet ndërtim i shpërndarë me dendësi të ulët. Ky është sprawl në kuptimin e plotë, me kosto për infrastrukturë, transport dhe tokë bujqësore.','<b>Dispersal persists.</b> Most detached construction neither joined the city nor formed nuclei: it remains low-density scattered building. This is sprawl in the full sense, with costs for infrastructure, transport and farmland.')
    : top === sn && nNuc.length >= 2 ? L(`<b>Ndërtimi i shkëputur po konsolidohet në ${nNuc.length} bërthama të reja.</b> Rritja nuk po shkon vetëm drejt qytetit kryesor, por po krijon qendra satelitore: një drejtim drejt strukturës policentrike.`,`<b>Detached construction is consolidating into ${nNuc.length} new nuclei.</b> Growth is not only moving towards the main city but creating satellite centres: a shift towards a polycentric structure.`)
    : top === sn && big ? L(`<b>Një bërthamë e vetme e re (${fmtHa(big.ha)} ha) mban pjesën më të madhe të ndërtimit të shkëputur.</b> Rritja jashtë qytetit po përqendrohet në një vend, jo po shpërndahet; ende është herët për ta quajtur strukturë policentrike.`,`<b>A single new nucleus (${fmtHa(big.ha)} ha) holds the largest share of detached construction.</b> Growth outside the city is concentrating in one place rather than scattering; it is too early to call it a polycentric structure.`)
    : L('<b>Nuk ka një rrugë të vetme.</b> Ndërtimi i shkëputur ndahet ndërmjet bashkimit me qytetin, shpërndarjes që mbetet dhe bërthamave të reja.','<b>There is no single path.</b> Detached construction splits between joining the city, persistent dispersal and new nuclei.');
  if (top !== ss && ss >= .3) verdict += ' '+L(`Megjithatë, <b>${fmt1(ss*100)}%</b> mbetet ende i shpërndarë: ky është sprawl-i aktiv që duhet ndjekur.`,`Still, <b>${fmt1(ss*100)}%</b> remains scattered: this is the active sprawl to watch.`);
  return `<div class="stage-story"><p>${L(`Nga <b>${fmtHa(all)} ha</b> ndërtim i ri ${steps[0].short}–${steps[i].short}, <b>${fmt1(city/all*100)}%</b> u ndërtua ngjitur me qytetin (mbushje dhe skaj) dhe <b>${fmt1(det/all*100)}%</b> (${fmtHa(det)} ha) u ndërtua i shkëputur prej tij.`,`Of <b>${fmtHa(all)} ha</b> of new construction ${steps[0].short}–${steps[i].short}, <b>${fmt1(city/all*100)}%</b> was built against the city (infill and edge) and <b>${fmt1(det/all*100)}%</b> (${fmtHa(det)} ha) was built detached from it.`)}</p>
    <p>${L(`Deri në ${steps[i].short}, nga ndërtimi i shkëputur: <b>${pc(joined)}%</b> u bashkua me qytetin${med != null ? ` (mesatarisht pas ${med} vjetësh)` : ''}, <b>${pc(nuclei)}%</b> u rrit në bërthama ose qyteza të reja${firstC ? ` (e para në ${yr(firstC)})` : ''}, dhe <b>${pc(sprawl)}%</b> mbetet i shpërndarë (A dhe B). Kjo pjesë e fundit është sprawl-i që mbetet.`,`By ${steps[i].short}, of the detached construction: <b>${pc(joined)}%</b> joined the city${med != null ? ` (median after ${med} years)` : ''}, <b>${pc(nuclei)}%</b> grew into new nuclei or towns${firstC ? ` (the first in ${yr(firstC)})` : ''}, and <b>${pc(sprawl)}%</b> remains scattered (A and B). This last share is the sprawl that remains.`)}</p>
    <p>${verdict}</p></div>`;
}
function stageSeriesSvg(z) {
  const steps = period().steps, off = baseOff(), n = z.series.length, W = 300, H = 120, m = {l:34,r:6,t:8,b:20}, pw = W-m.l-m.r, ph = H-m.t-m.b, slot = pw/Math.max(1,n), bw = Math.max(1.5,slot*.72);
  const order = [5,4,3,2,1], tot = v => order.reduce((s,k) => s+v[k],0), max = niceMax(Math.max(...z.series.map(tot),1e-6)*1.05), now = state.index-1;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="sprawl-chart" role="img">`;
  for (const t of [0,max/2,max]) { const y = m.t+ph-t/max*ph;svg += `<line x1="${m.l}" x2="${W-m.r}" y1="${y}" y2="${y}" stroke="#1e2a3a"/><text x="${m.l-4}" y="${y+3}" text-anchor="end" font-size="8" fill="#7f93ab">${fmtHa(t)}</text>`; }
  z.series.forEach((v,j) => {
    const x = m.l+j*slot+(slot-bw)/2;let y = m.t+ph;
    svg += `<g opacity="${j > now ? .3 : 1}"><title>${esc(steps[j+1]?.label || '')}: ${order.map(k => `${STAGES[k].k} ${fmtHa(v[k])} ha`).join(' · ')}</title>`;
    for (const k of order) { const h = v[k]/max*ph;if (h <= 0) continue;y -= h;svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(.5,h-.6).toFixed(1)}" fill="rgb(${STAGES[k].c.join(',')})"/>`; }
    svg += '</g>';
  });
  const ticks = z.series.map((_,j) => j).filter(j => n <= 12 || Number(String(steps[j+1]?.short).replace(/\D/g,'').slice(-4))%5 === 0 || j === n-1);
  for (const j of ticks) svg += `<text x="${(m.l+j*slot+slot/2).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="8" fill="#7f93ab">${esc(steps[j+1]?.short || '')}</text>`;
  return svg+'</svg>';
}
function stageHtml() {
  const z = stageSummary();
  if (!z || state.index === 0) return '';
  const steps = period().steps, off = baseOff(), yr = t => steps[t-off-1]?.short || '';
  const sw = k => `<span><i style="background:rgb(${STAGES[k].c.join(',')})"></i>${esc(STAGES[k].t)}</span>`;
  const traj = z.traj.filter(t => t.path.length > 1 || t.stage >= 3).slice(0,6).map(t => `<li><b>${fmtHa(t.ha)} ha</b> · ${t.path.map(([k,y]) => `<span class="stg" style="color:rgb(${STAGES[k].c.join(',')})">${STAGES[k].k}</span> ${esc(yr(y))}`).join(' → ')}</li>`).join('');
  return `<h4 class="sprawl-sub">${L('Çfarë ndodhi me ndërtimin e shkëputur','What happened to detached construction')}</h4>
    ${stageStory(z)}
    <div class="sprawl-chart-title">${L(`Prej shkallës kur u ndërtua → shkalla në ${steps[state.index].short} (ha)`,`From the stage when built → stage in ${steps[state.index].short} (ha)`)}</div>
    ${sankeySvg(z)}
    <div class="sdg-legend">${[1,2,3,4,5].map(sw).join('')}</div>
    <div class="sprawl-chart-title">${L('Ndërtimi i ri i shkëputur sipas shkallës në çdo vit (ha)','Detached new construction by stage in every year (ha)')}</div>
    ${stageSeriesSvg(z)}
    ${traj ? `<div class="sprawl-chart-title">${L('Trajektoret e strukturave më të mëdha','Trajectories of the largest structures')}</div><ul class="corr-list">${traj}</ul>` : ''}
    <p class="note">${L(`Shkallët dhe pragjet ndryshohen në legjendën e hartës ose këtu lart. Parazgjedhjet ndjekin rregullin e dendësisë të Angel et al. (2010) në rrethin 1 km² (100 ha): një strukturë prej 10 ha e mbush vetë 10% të tij dhe arrin dendësinë suburbane (C), një prej 50 ha e mbush 50% dhe arrin dendësinë urbane (D); nën 1 ha janë ndërtime të izoluara (Wilson et al. 2003). E: brenda 100 m nga trupi urban e suburban i ${steps[0].short}. Struktura vetëm rritet, prandaj kalimi shkon vetëm përpara. Llogaritja: ${number(Math.round(z.S.ms))} ms.`,`Stages and thresholds can be changed in the map legend or above. The defaults follow the density rule of Angel et al. (2010) in the 1 km² circle (100 ha): a 10 ha structure fills 10% of it on its own and reaches suburban density (C), a 50 ha one fills 50% and reaches urban density (D); below 1 ha are isolated buildings (Wilson et al. 2003). E: within 100 m of the urban and suburban body of ${steps[0].short}. Structures only grow, so the stage only moves forward. Computed in ${number(Math.round(z.S.ms))} ms.`)}</p>`;
}

window.atlasExport = exportSvg;   // for testing from the console
// Static page text, translated on load when the page is in English.
const EN_STATIC = {"ATLASI URBAN":"URBAN ATLAS","Pragjet e madhësisë: kur një strukturë kalon shkallë":"Size thresholds: when a structure moves up a stage","Shkallën e strukturës: A → E":"Stage of the structure: A → E","Madhësia ku kërcimi nuk është më sprawl":"Size at which leapfrog is no longer sprawl","≥ 5 ha: bërthamë e re":"≥ 5 ha: new nucleus","≥ 10 ha: bërthamë e re (parazgjedhur)":"≥ 10 ha: new nucleus (default)","≥ 25 ha: bërthamë e re":"≥ 25 ha: new nucleus","≥ 50 ha: bërthamë e re":"≥ 50 ha: new nucleus","Pa prag: çdo kërcim është sprawl":"No limit: all leapfrog is sprawl","Zgjerim i shpërndarë (sprawl) = kërcim në struktura nën pragun e madhësisë. Mbushja dhe zgjerimi në skaj nuk konsiderohen sprawl.":"Sprawl = leapfrog in structures below the size threshold. Infill and edge extension are not counted as sprawl.","5. Madhësia: pikselat e kërcimit deri në 100 m larg njëri-tjetrit formojnë një strukturë. Nën 1 ha janë ndërtime të shpërndara (rritja e izoluar te Wilson et al. 2003); nga 1 ha deri te pragu janë grumbuj të shkëputur (degëzimi i grumbulluar); bërthamë e re është struktura e shkëputur, më shumë se 100 m larg ndërtimit urban e suburban të vitit bazë, ku ndërtimi i ri arrin pragun; madhësia matet në vitin e zgjedhur për gjithë strukturën, bashkë me mbushjen dhe skajin e mëvonshëm rreth farës së kërcimit, sepse sapo struktura dendësohet, pikselat e saj nuk janë më kërcim. Pragjet ndryshohen në legjendën e hartës; parazgjedhjet janë 1, 10 dhe 50 ha. Me pragun 10 ha struktura mbulon vetë të paktën 10% të rrethit 1 km² rreth saj, pra arrin dendësinë suburbane sipas rregullit të Angel et al. (2010) dhe krijon skajin e vet; ajo trajtohet si vendbanim i ri, jo si shpërndarje. Literatura nuk jep një prag të vetëm: Angel et al. e quajnë kërcim çdo ndërtim jashtë 100 m pa kufi madhësie, ndërsa Wilson et al. ia lënë përdoruesit vendimin se cilat lloje janë sprawl.":"5. Size: leapfrog pixels at most 100 m apart form one structure. Below 1 ha they are scattered buildings (isolated growth in Wilson et al. 2003); from 1 ha up to the threshold they are detached clusters (clustered branch); a new nucleus is a detached structure, more than 100 m from the base year's urban and suburban built-up, whose new construction reaches the threshold; its size is measured in the chosen year on the whole structure, including the later infill and edge growth around the leapfrog seed, because once the structure densifies its pixels are no longer leapfrog. The thresholds can be changed in the map legend; the defaults are 1, 10 and 50 ha. With the 10 ha threshold a structure on its own covers at least 10% of the 1 km² circle around it, so it reaches suburban density under the rule of Angel et al. (2010) and creates its own fringe; it is treated as a new settlement, not as dispersal. The literature gives no single threshold: Angel et al. call any construction beyond 100 m leapfrog with no size limit, while Wilson et al. leave it to the user to decide which types are sprawl.","Zgjerim i shpërndarë (sprawl) = kërcim. Mbushja dhe zgjerimi në skaj nuk konsiderohen sprawl.":"Sprawl = leapfrog. Infill and edge extension are not counted as sprawl.","Kufizime: rrugët nuk përdoren drejtpërdrejt. Ndërtimi jashtë kufirit të shtetit nuk është në të dhëna, prandaj dendësia afër kufirit mund të nënvlerësohet.":"Limitations: roads are not used directly. Built-up land beyond the national border is not in the data, so density near the border may be underestimated.","Pamja e hartës":"Map view","Zgjerimi në kohë":"Growth over time","Format e zgjerimit":"Forms of expansion","(mbushje, skaj, kërcim) ·":"(infill, edge, leapfrog) ·","Metoda":"Method","4. Klasa aktuale: ndërtimi i mëparshëm rivlerësohet në gjurmën e vitit të zgjedhur. Pikseli bëhet mbushje kur është urban ose suburban dhe brenda 100 m nuk ka hapësirë të lirë të jashtme (skaj i jashtëm ose rurale); skaj kur është urban ose suburban, por ka të tillë afër; përndryshe mbetet në klasën kur u ndërtua. Kalimi shkon vetëm përpara (sprawl → skaj → mbushje), sepse WSF nuk heq ndërtime.":"4. Current class: earlier construction is re-evaluated in the footprint of the chosen year. A pixel becomes infill when it is urban or suburban with no exterior open space (exterior fringe or rural) within 100 m; edge when it is urban or suburban but has such space nearby; otherwise it keeps its class from when it was built. The change only goes forward (sprawl → edge → infill), because WSF never removes built-up land.","Klasën aktuale në vitin e zgjedhur":"Current class in the chosen year","Shfaq në hartë":"Show on map","Klasën kur u ndërtua":"Class when built","Vetëm shtesat e vitit":"This year's additions only","Statusin në vitin e zgjedhur":"Status in the chosen year","Shkarko CSV të ndryshimeve në kohë":"Download the change-over-time CSV","Krahasimi":"Comparison","Hap pas hapi: çdo vit me vitin paraprak":"Step by step: each year against the year before","Dy data: viti bazë me vitin e zgjedhur":"Two dates: base year against the chosen year","Klasifikimi bëhet në rezolucionin burimor të WSF (10 m Tracker, rreth 30 m Evolution), në një dritare që e kalon zonën me 700 m për kontekst. «Hap pas hapi» krahason ndërtimin e ri të çdo viti me gjurmën e vitit paraprak dhe i mbledh rezultatet nga viti bazë deri në vitin e zgjedhur; kështu ruhet radha kohore e rritjes. «Dy data» krahason gjurmën e vitit bazë me gjithë ndërtimin e ri deri në vitin e zgjedhur, si te Angel et al. (2010), ku intervalet janë rreth 10 vjet; në intervale të gjata copat e njëpasnjëshme bashkohen.":"The classification runs at the WSF source resolution (10 m Tracker, about 30 m Evolution), in a window that extends 700 m beyond the area for context. “Step by step” compares each year's new construction with the footprint of the year before and adds the results from the base year to the chosen year, which keeps the order in which growth happened. “Two dates” compares the base-year footprint with all new construction up to the chosen year, as in Angel et al. (2010), whose intervals are about 10 years; over long intervals successive patches merge.","4. Linear (shirit): copë zgjerimi ose kërcimi me gjerësi ≤ 100 m, gjatësi ≥ 250 m dhe gjatësi/gjerësi ≥ 4, që shtrihet të paktën për gjysmën e saj në hapësirë rurale. Gjerësia vlerësohet nga distanca mesatare deri te skaji i copës.":"4. Linear (ribbon): an extension or leapfrog patch at most 100 m wide, at least 250 m long, with length/width ≥ 4 and at least half of it in rural space. Width is estimated from the mean distance to the patch edge.","Klasifikimi i ndërtimit të ri: mbushje, zgjerim, linear, kërcim":"Classification of new construction: infill, extension, linear, leapfrog","Zgjerimi i shpërndarë":"Urban sprawl","(Urban Sprawl) ·":"·","Metoda e klasifikimit":"Classification method","Krahasohet ndërtimi i vitit bazë me atë të vitit të zgjedhur, në rezolucionin burimor të WSF (10 m Tracker, rreth 30 m Evolution), në një dritare që e kalon zonën me 700 m për kontekst.":"The built-up area of the base year is compared with that of the selected year, at the WSF source resolution (10 m Tracker, about 30 m Evolution), in a window that extends 700 m beyond the area for context.","1. Çdo piksel i ndërtuar i vitit bazë merr dendësinë e ndërtimit në rrethin 1 km² rreth tij: urban ≥ 50%, suburban 10–50%, rural < 10% (llogaritur në qeliza 30 m).":"1. Every built-up pixel of the base year gets the built-up share in the 1 km² circle around it: urban ≥ 50%, suburban 10–50%, rural < 10% (computed on 30 m cells).","2. Hapësira e lirë nën 100 m nga ndërtimi urban ose suburban është skaj (fringe); më larg është rurale. Hapësira rurale e rrethuar plotësisht deri në 200 ha është e kapur dhe i përket gjurmës urbane. Skaji nën 100 m nga hapësira rurale është i jashtëm; pjesa tjetër është e brendshme.":"2. Open space less than 100 m from urban or suburban built-up is fringe; farther away it is rural. Rural space fully enclosed and up to 200 ha is captured and belongs to the urban footprint. Fringe less than 100 m from rural space is exterior; the rest is interior.","3. Copat e ndërtimit të ri janë piksela të ri të lidhur (8 fqinjë; te Tracker bashkohen boshllëqet deri në 20 m). Mbushje: copa është tërësisht në hapësirën e brendshme. Kërcim: copa është tërësisht në hapësirën rurale. Zgjerim në skaj: të gjitha të tjerat.":"3. Patches of new construction are connected new pixels (8 neighbours; in Tracker gaps of up to 20 m are bridged). Infill: the patch lies entirely in interior space. Leapfrog: the patch lies entirely in rural space. Edge extension: all others.","4. Linear (shirit): copë zgjerimi ose kërcimi me gjatësi ≥ 250 m dhe gjatësi/gjerësi ≥ 4, që shtrihet të paktën për gjysmën e saj në hapësirë rurale. Gjerësia vlerësohet nga distanca mesatare deri te skaji i copës.":"4. Linear (ribbon): an extension or leapfrog patch at least 250 m long with length/width ≥ 4, at least half of it in rural space. Width is estimated from the mean distance to the patch edge.","Zgjerim i shpërndarë (sprawl) = linear + kërcim. Mbushja dhe zgjerimi në skaj nuk konsiderohen sprawl.":"Sprawl = linear + leapfrog. Infill and edge extension are not counted as sprawl.","Burimet: Angel, S., Parent, J. & Civco, D. L. (2010). The Fragmentation of Urban Footprints: Global Evidence of Sprawl, 1990–2000. Lincoln Institute of Land Policy. · Wilson, E. H., Hurd, J. D., Civco, D. L., Prisloe, M. P. & Arnold, C. (2003). Development of a geospatial model to quantify, describe and map urban growth. Remote Sensing of Environment, 86(3), 275–285.":"Sources: Angel, S., Parent, J. & Civco, D. L. (2010). The Fragmentation of Urban Footprints: Global Evidence of Sprawl, 1990–2000. Lincoln Institute of Land Policy. · Wilson, E. H., Hurd, J. D., Civco, D. L., Prisloe, M. P. & Arnold, C. (2003). Development of a geospatial model to quantify, describe and map urban growth. Remote Sensing of Environment, 86(3), 275–285.","Kufizime: pragjet e klasës lineare janë zgjedhje e këtij atlasi (Wilson et al. nuk japin vlera numerike të njëjta); rrugët nuk përdoren drejtpërdrejt. Ndërtimi jashtë kufirit të shtetit nuk është në të dhëna, prandaj dendësia afër kufirit mund të nënvlerësohet.":"Limitations: the thresholds of the linear class are this atlas's choice (Wilson et al. do not give the same numbers); roads are not used directly. Built-up land beyond the national border is not in the data, so density near the border may be underestimated.","Shkarko CSV të copave":"Download the patches CSV","Përkufizim":"Definition","Zgjerimi i shpërndarë urban":"Urban sprawl","(Urban Sprawl)":"(Zgjerimi i shpërndarë urban)","Zgjerimi i shpërndarë urban (Urban Sprawl) është zhvillimi hapësinor i shpërndarë, me dendësi të ulët ndërtimi, në periferi të zonave urbane, i karakterizuar nga fragmentimi i strukturës urbane, shtrirja lineare e ndërtimeve përgjatë korridoreve të transportit dhe varësia e lartë nga përdorimi i automjeteve.":"Urban sprawl is dispersed, low-density spatial development on the periphery of urban areas, characterised by a fragmented urban structure, linear development along transport corridors and a high dependence on car use.","Burimi: McCann, E. J. (2009). Sprawl. Në The Dictionary of Human Geography, botimi i pestë, Wiley-Blackwell, f. 719.":"Source: McCann, E. J. (2009). Sprawl. In The Dictionary of Human Geography, 5th edition, Wiley-Blackwell, p. 719.","Shënim: Ky është përkthim dhe përmbledhje në shqip e përkufizimit të librit, jo citim fjalë për fjalë.":"Note: this is a summary of the book's definition, not a verbatim quotation.","Në këtë atlas, kategoria «Shpërndarje» është treguesi sasior i këtij procesi: popullsia rritet, por zona e ndërtuar rritet më shpejt (SDG 11.3.1, LCRPGR > 1). Dendësia, fragmentimi dhe shtrirja përgjatë rrugëve nuk maten drejtpërdrejt.":"In this atlas, the “Sprawl” category is the quantitative indicator of this process: population grows, but the built-up area grows faster (SDG 11.3.1, LCRPGR > 1). Density, fragmentation and ribbon development along roads are not measured directly.","Animacion me seri kohore":"Time-series animation","I njëjti shabllon si harta e printuar, një kuadër për çdo vit, nga viti bazë deri në vitin e fundit.":"The same template as the printed map, one frame per year, from the base year to the last year.","Kohëzgjatja e çdo viti":"Duration of each year","0,5 sekonda":"0.5 seconds","0,8 sekonda":"0.8 seconds","1,2 sekonda":"1.2 seconds","2 sekonda":"2 seconds","Madhësia":"Size","Kalim i butë mes viteve":"Smooth transition between years","● Krijo videon":"● Create the video","Ndalo":"Stop","Zgjerimi urban në Kosovë": "Urban expansion in Kosovo", "Zgjerimi urban": "Urban expansion", "në Kosovë": "in Kosovo", "Një atlas nga": "An atlas by", "Zgjidh vendbanimin dhe ndiq ndryshimin e tij në kohë.": "Pick a settlement and follow how it changed over time.", "Shteti": "Country", "Vendbanimi": "Settlement", "Periudha": "Period", "Viti bazë": "Base year", "nga cili vit nis analiza": "the year the analysis starts", "Ndërtimi deri në vitin bazë shfaqet gri; shtesat, grafikët dhe CSV-të llogariten që nga ky vit.": "Construction up to the base year is shown in grey; additions, charts and CSVs are computed from this year on.", "Mbulimi i hartës": "Map extent", "Shfaq gjithë Kosovën": "Show all of Kosovo", "Zona e interesit": "Zone of interest", "Vizatoni një zonë në hartë ose ngarkoni kufirin e saj. Statistikat, grafikët, harta dhe CSV-të llogariten vetëm për të.": "Draw a zone on the map or upload its boundary. Statistics, charts, the map and CSVs are computed for it alone.", "✎ Vizato në hartë": "✎ Draw on the map", "⤒ Ngarko skedar": "⤒ Upload file", "SHP (në .zip, ose .shp + .shx + .dbf + .prj), KML, KMZ, GeoJSON. Pranohen WGS84, UTM, KOSOVAREF01 dhe Gauss-Krüger. Skedari mund të tërhiqet edhe mbi hartë.": "SHP (in a .zip, or .shp + .shx + .dbf + .prj), KML, KMZ, GeoJSON. WGS84, UTM, KOSOVAREF01 and Gauss-Krüger are accepted. You can also drag the file onto the map.", "Shfaq": "Show", "✕ Hiq": "✕ Remove", "Harta bazë": "Base map", "Burimi": "Source", "Asnjë": "None", "Esri · imazh satelitor": "Esri · satellite imagery", "Paraqitja e sfondit": "Background style", "E errët · thekson ngjyrat e viteve": "Dark · highlights the year colours", "RGB · ngjyrat natyrale": "RGB · natural colours", "Pankromatike · bardhë e zi": "Panchromatic · black and white", "Transparenca": "Transparency", "Zonë e ndërtuar në pamje": "Built-up area in view", "Shtesa nga kuadri i mëparshëm": "Added since the previous frame", "Shkarko hartën e kësaj zone": "Download the map of this area", "Pamja aktuale, me legjendë, statistika dhe autorësi": "Current view, with legend, statistics and credits", "Rreth të dhënave": "About the data", "WSF identifikon zonat e ndërtuara në imazhe satelitore. Ngjyra tregon periudhën kur zona u identifikua.": "WSF detects built-up areas in satellite imagery. The colour shows the period in which an area was detected.", "Evolution ka rezolucion burimor rreth 30 m. Tracker ka rezolucion burimor 10 m. Pamja në ekran përshtatet sipas zmadhimit.": "Evolution has a source resolution of about 30 m. Tracker has a source resolution of 10 m. The on-screen view adapts to the zoom level.", "Tracker nis me gjendjen e korrikut 2016. Kuadrot e mëvonshme paraqesin janarin e vitit përkatës. Periudhat shfaqen veçmas sepse produktet përdorin metoda të ndryshme.": "Tracker starts with the state of July 2016. Later frames show January of each year. The periods are shown separately because the products use different methods.", "Sipërfaqet janë vlerësime brenda pamjes dhe kufirit të shtetit. Katalogu i emrave vjen nga GeoNames, me variante të emrave për kërkim. Harta bazë vjen nga OpenStreetMap.": "Areas are estimates within the view and the country boundary. The place-name catalogue comes from GeoNames, with name variants for search. The base map comes from OpenStreetMap.", "Kufijtë e komunave dhe të zonave kadastrale janë në sistemin KOSOVAREF01 (EPSG:9141).": "Municipal and cadastral zone boundaries are in KOSOVAREF01 (EPSG:9141).", "Të dhënat e Tracker përditësohen automatikisht sapo DLR publikon një hap të ri": "Tracker data update automatically as soon as DLR publishes a new step", "Shkarko versionin offline (një skedar HTML)": "Download the offline version (one HTML file)", "Si ta citoni": "How to cite", "Kopjo": "Copy", "© Rizah Murseli · Atlasi urban i Kosovës": "© Rizah Murseli · Urban Atlas of Kosovo", "GJENDJA FILLESTARE": "BASELINE", "↶ Kthe": "↶ Undo", "✓ Përfundo": "✓ Finish", "Anulo": "Cancel", "Filtri:": "Filter:", "◎ Diagrami radial": "◎ Radial diagram", "▢ Kufijtë": "▢ Boundaries", "Diagrami radial": "Radial diagram", "Shtesat vjetore brenda rrethit (rrezja": "Annual additions inside the circle (radius", "), sipas drejtimit.": "), by direction.", "Çdo shtyllë është një vit, me ngjyrën e vitit në hartë; koha ecën në drejtim të akrepave të orës.": "Each bar is one year, in that year's map colour; time runs clockwise.", "afër qendrës": "near the centre", "në mes": "middle", "në skaj": "outer edge", "kontribuuesit e OpenStreetMap": "OpenStreetMap contributors", "Gjendja": "State", "Shtesat e vitit": "Year's additions", "Krahaso": "Compare", "Majtas": "Left", "Djathtas 2015": "Right 2015", "Shko te filtri": "Go to the filter", "Hiq filtrin": "Clear filter", "Duke ngarkuar të dhënat…": "Loading data…", "Tërhiq hartën · Rrota për zmadhim": "Drag the map · Wheel to zoom", "Luaj": "Play", "Çdo ngjyrë i përket një viti. Grija tregon gjendjen fillestare. Shkurtore: ← → për vitin, hapësira për të luajtur.": "Each colour belongs to one year. Grey shows the baseline. Shortcuts: ← → for the year, space to play.", "Kjo zonë": "This area", "Njësitë": "Units", "Qëndrueshmëria": "Sustainability", "Gara 5 km": "5 km race", "Kosova": "Kosovo", "Rritja": "Growth", "Viti më aktiv": "Most active year", "Mesatarja vjetore": "Annual average", "Zona e ndërtuar, kumulative": "Built-up area, cumulative", "Shtesa sipas vitit": "Added area by year", "Statistikat përshkruese": "Descriptive statistics", "shtesat dhe rritja vjetore, pa gjendjen fillestare": "annual additions and growth, excluding the baseline", "Tabela për çdo vit": "Table for every year", "ha dhe %": "ha and %", "Shkarko CSV të zonës": "Download the area's CSV", "Qendër apo periferi?": "Centre or periphery?", "% e tokës së ndërtuar sipas largësisë nga qendra e pamjes": "% of land built up by distance from the centre of the view", "1 · Komunat": "1 · Municipalities", "një ose disa": "one or more", "Gjithë Kosova · 38 komunat": "All of Kosovo · 38 municipalities", "Gjithë Kosova": "All of Kosovo", "Mbyll": "Close", "2 · Zonat kadastrale": "2 · Cadastral zones", "opsionale · pa zgjedhje = njësitë e plota": "optional · none chosen = whole units", "Zgjidh fillimisht komunën": "Choose the municipality first", "Komunat e plota": "Whole municipalities", "Treguesi": "Indicator", "Pjesa e territorit të ndërtuar (%)": "Share of territory built up (%)", "Sipërfaqja e ndërtuar": "Built-up area", "Rritja nga gjendja fillestare (%)": "Growth since the baseline (%)", "Shtesa nga gjendja fillestare": "Added since the baseline", "Shtesa për km² territor (ha/km²)": "Added per km² of territory (ha/km²)", "Përzgjedhja": "Selection", "kliko njësitë në hartë, në hartën tematike ose në tabelë": "click units on the map, the thematic map or the table", "Shfaq në hartë": "Show on map", "Shkarko CSV": "Download CSV", "Ecuria në kohë": "Change over time", "Renditja": "Ranking", "Burimi i popullsisë": "Population source", "Harta e efikasitetit të tokës": "Land-use efficiency map", "SDG 11.3.1 · kliko për ta shtuar ose hequr nga filtri": "SDG 11.3.1 · click to add or remove from the filter", "Toka kundrejt popullsisë": "Land versus population", "rritja vjetore": "annual growth", "Zonë e ndërtuar për banor, 2024": "Built-up area per inhabitant, 2024", "m² sipas WSF Tracker": "m² from WSF Tracker", "Lidhja me objektivat e zhvillimit të qëndrueshëm": "Link to the Sustainable Development Goals", "Ndërtimet sipas përshtatshmërisë së tokës bujqësore": "Construction by agricultural land suitability", "Mbi çfarë u ndërtua?": "What was built on?", "Metoda dhe kufizimet": "Method and limitations", ": zona e ndërtuar nga WSF Tracker, janar 2017 → janar 2024.": ": built-up area from WSF Tracker, January 2017 → January 2024.", "Kur popullsia bie, raporti nuk ka kuptim dhe njësia renditet te \"zgjerim me popullsi në rënie\".": "When population falls, the ratio is meaningless and the unit is listed under \"expansion with declining population\".", "Periudhat e popullsisë dhe të tokës nuk përputhen plotësisht; krahasohen shpejtësitë vjetore. Për katër komunat veriore të dy vitet janë vlerësime: ato janë jashtë totalit. Bojkoti i pjesshëm i 2011 në disa komuna me shumicë serbe mund ta fryjë rritjen e tyre. Diaspora nuk numërohet si popullsi rezidente, por shtëpitë e saj e rrisin zonën e ndërtuar.": "The population and land periods do not match exactly; annual rates are compared. For the four northern municipalities both years are estimates: they are left out of the total. The partial 2011 boycott in some Serb-majority municipalities may inflate their growth. The diaspora is not counted as resident population, but its houses do add to the built-up area.", "Popullsia jepet për njësitë e nivelit të parë. Zonat më të vogla dhe rrethi radial nuk përdoren këtu.": "Population is given for first-level units. Smaller zones and the radial circle are not used here.", "Shkarko CSV (SDG 11.3.1)": "Download CSV (SDG 11.3.1)", "38 qendrat komunale, krahasuar në rreze të njëjtë prej 5 km nga qendra. Renditja ndjek vitin në kohëzgjatje; luaje animacionin për ta parë garën.": "38 municipal centres, compared within the same 5 km radius of the centre. The ranking follows the timeline; play the animation to watch the race.", "Rendit sipas": "Sort by", "Sipërfaqes së ndërtuar": "Built-up area", "Rritjes nga viti bazë (%)": "Growth since the base year (%)", "Shtesës së vitit": "Year's addition", "Gjithë Kosova · 1985–2015": "All of Kosovo · 1985–2015", "Gjithë Kosova · 2016–2026": "All of Kosovo · 2016–2026", "Dy produktet maten ndryshe (30 m kundrejt 10 m), ndaj vlerat e tyre nuk vazhdojnë njëra-tjetrën. Krahasoni ritmin, jo nivelin.": "The two products measure differently (30 m versus 10 m), so their values do not continue each other. Compare the pace, not the level.", "Vendbanimet me shtesën më të madhe": "Settlements with the largest additions", "Koncepti, analiza dhe zhvillimi:": "Concept, analysis and development:", "· Harta bazë ©": "· Base map ©", "Analiza": "Analysis", "Diagrami radial i shtesave sipas drejtimit": "Radial diagram of additions by direction", "Eksploro historinë e zgjerimit urban të çdo vendbanimi në Kosovë, nga të dhënat satelitore të DLR.": "Explore the history of urban expansion of every settlement in Kosovo, from DLR satellite data.", "Filtro komunat": "Filter municipalities", "Filtro komunat…": "Filter municipalities…", "Filtro zonat kadastrale": "Filter cadastral zones", "Filtro zonat sipas emrit…": "Filter zones by name…", "Harta e zonave të ndërtuara. Tërhiq për lëvizje, përdor rrotën për zmadhim dhe kliko dy herë për qendrim.": "Map of built-up areas. Drag to move, use the wheel to zoom and double-click to centre.", "Harta interaktive": "Interactive map", "Hiq filtrin e njësive": "Clear the unit filter", "Hiq kulmin e fundit (Backspace)": "Remove the last vertex (Backspace)", "Kliko për të zgjedhur një pikë në Kosovë": "Click to pick a point in Kosovo", "Kërko qytet ose fshat…": "Search for a town or village…", "Legjenda e viteve": "Year legend", "Luaj animacionin": "Play the animation", "Mënyra e shfaqjes": "Display mode", "Ndarësi i krahasimit": "Comparison divider", "Rikthe pamjen e vendbanimit": "Return to the settlement view", "Shpejtësia": "Speed", "Transparenca e hartës bazë": "Base map transparency", "Viti": "Year", "Viti në anën e majtë": "Year on the left side", "Zgjidh shtetin": "Choose the country", "Zmadho hartën": "Zoom in", "Zvogëlo hartën": "Zoom out", "Murseli, R. (2026). Zgjerimi urban në Kosovë: atlas interaktiv i zonave të ndërtuara, 1985–2026. Të dhënat: DLR World Settlement Footprint.": "Murseli, R. (2026). Urban expansion in Kosovo: an interactive atlas of built-up areas, 1985–2026. Data: DLR World Settlement Footprint.", "Esc": "Esc"};
function translateStatic() {
  if (LANG !== 'en') return;
  const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode();n;n = walker.nextNode()) {
    const t = n.nodeValue.trim();
    if (t && EN_STATIC[t]) n.nodeValue = n.nodeValue.replace(t,EN_STATIC[t]);
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title],meta[name=description]')) for (const a of ['placeholder','aria-label','title','content']) {
    const v = el.getAttribute(a);
    if (v && EN_STATIC[v.trim()]) el.setAttribute(a,EN_STATIC[v.trim()]);
  }
  document.title = EN_STATIC[document.title] || document.title;
}
translateStatic();
for (const b of document.querySelectorAll('[data-lang]')) {
  b.setAttribute('aria-pressed',String(b.dataset.lang === LANG));
  b.onclick = () => {
    if (b.dataset.lang === LANG) return;
    try { localStorage.setItem('atlas-lang',b.dataset.lang); } catch {}
    const h = new URLSearchParams(location.hash.slice(1));
    if (b.dataset.lang === 'en') h.set('l','en'); else h.delete('l');
    location.hash = h.toString();
    location.reload();
  };
}
start();
// ---------- Sustainability: SDG 11.3.1 (land consumption vs population growth) ----------
// Population is known per municipality only (census 2011 and 2024). Land uses WSF Tracker, Jan 2017 → Jan 2024.
const SDG_CAT = {
  eff:{c:'#3987e5',t:L('Rritje efikase','Efficient growth'),d:L('Popullsia rritet më shpejt se zona e ndërtuar.','Population grows faster than the built-up area.')},
  spr:{c:'#c98500',t:L('Shpërndarje','Sprawl'),d:L('Zona e ndërtuar rritet më shpejt se popullsia.','The built-up area grows faster than the population.')},
  dec:{c:'#d55181',t:L('Zgjerim me popullsi në rënie','Expansion with declining population'),d:L('Popullsia bie, ndërsa zona e ndërtuar rritet.','Population falls while the built-up area grows.')},
  na:{c:'#5b6675',t:L('Të dhëna të pasigurta','Uncertain data'),d:L('Popullsia në veri është vlerësim, jo regjistrim.','Population in the north is an estimate, not a census count.')}
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
  for (const u of list) { const v = unitPop(u);r.areaKm2 += u.areaKm2;r.p11 += v[0];r.p24 += v[1];r.b17 += rawSeries(u,'tracker')[i0];r.b24 += rawSeries(u,'tracker')[i1]; }
  r.pgr = Math.log(r.p24/r.p11)/P.years*100;
  r.lcr = Math.log(r.b24/r.b17)/(t[i1].year-t[i0].year)*100;
  r.ratio = r.pgr > 0 ? r.lcr/r.pgr : null;
  r.m2pc = r.b24*1e6/r.p24;r.dpop = r.p24-r.p11;r.dha = (r.b24-r.b17)*100;
  r.cat = list.length === 1 && r.estimate ? 'na' : r.pgr <= 0 ? 'dec' : r.lcr > r.pgr ? 'spr' : 'eff';
  if (!(r.b17 > 0) || !(r.p11 > 0) || !(r.p24 > 0)) {
    Object.assign(r,{cat:'na',ratio:null,reason:L('Pa zonë të ndërtuar ose pa popullsi në vitin bazë: shpejtësitë nuk llogariten.','No built-up area or no population in the base year: rates cannot be computed.')});
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
const sgn = (v,d=1) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '')+new Intl.NumberFormat(LOCALE,{minimumFractionDigits:d,maximumFractionDigits:d}).format(Math.abs(v));
const int = v => new Intl.NumberFormat(LOCALE,{maximumFractionDigits:0}).format(v);
const dec = (v,d) => new Intl.NumberFormat(LOCALE,{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const hatch = id => `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#3a4350"/><line x1="0" y1="0" x2="0" y2="6" stroke="#6b7685" stroke-width="2"/></pattern>`;
function sdgFocus() {
  const {kosovo} = sdgAll(), ms = pickedMunicipalities().filter(u => u.pop && unitPop(u));
  if (!ms.length) return kosovo;
  return Object.assign(sdgMetrics(ms,ms.length === 1 ? ms[0].name : filterLabel(ms)),{ids:new Set(ms.map(u => u.id))});
}
function sdgTipHtml(r) {
  return L(`<b>${esc(r.name)}</b> <span style="color:${SDG_CAT[r.cat].c}">· ${SDG_CAT[r.cat].t}</span><br>Popullsia ${popPeriod().y0}–${popPeriod().y1}: ${int(r.p11)} → ${int(r.p24)} (${sgn(r.pgr,2)} %/vit)<br>Zona e ndërtuar: ${sgn(r.dha,0)} ha (${sgn(r.lcr,2)} %/vit)<br>SDG 11.3.1: <b>${r.ratio == null ? '—' : dec(r.ratio,2)}</b> · ${int(r.m2pc)} m²/banor${r.estimate ? '<br><small>popullsia e vlerësuar</small>' : ''}`,`<b>${esc(r.name)}</b> <span style="color:${SDG_CAT[r.cat].c}">· ${SDG_CAT[r.cat].t}</span><br>Population ${popPeriod().y0}–${popPeriod().y1}: ${int(r.p11)} → ${int(r.p24)} (${sgn(r.pgr,2)} %/yr)<br>Built-up area: ${sgn(r.dha,0)} ha (${sgn(r.lcr,2)} %/yr)<br>SDG 11.3.1: <b>${r.ratio == null ? '—' : dec(r.ratio,2)}</b> · ${int(r.m2pc)} m²/inhabitant${r.estimate ? '<br><small>estimated population</small>' : ''}`);
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
    ? L(`<b>P</b>: popullsia rezidente sipas regjistrimeve ${P.y0} dhe ${P.y1}. ${esc(P.src.source || '')}`,`<b>P</b>: resident population from the ${P.y0} and ${P.y1} censuses. ${esc(tx(P.src.source || ''))}`)
    : L(`<b>P</b>: popullsia sipas GHS-POP R2023A, e interpoluar në ${SDG_T0} dhe ${SDG_T1} nga epokat ${P.src.years.join(', ')}. ${esc(P.src.note || '')}`,`<b>P</b>: population from GHS-POP R2023A, interpolated to ${SDG_T0} and ${SDG_T1} from the epochs ${P.src.years.join(', ')}. ${esc(tx(P.src.note || ''))}`);
  $('sdgEstimateNote').hidden = !kosovo.excluded;
  $('sdgScatterNote').textContent = L(`rritja vjetore · popullsia ${P.y0}–${P.y1}, zona e ndërtuar ${SDG_T0}–${SDG_T1}`,`annual growth · population ${P.y0}–${P.y1}, built-up area ${SDG_T0}–${SDG_T1}`);
  $('sdgBarsNote').textContent = L(`m² sipas WSF Tracker · vija = ${C.name}`,`m² from WSF Tracker · line = ${C.name}`);
  // Verdict and scope
  $('sdgStory').innerHTML = f.cat === 'na' ? `<b>${esc(f.name)}</b>: ${f.reason || c.d}`
    : f.cat === 'dec' ? L(`<b>${esc(f.name)}</b>: popullsia ra <b>${int(-f.dpop)}</b> banorë nga ${P.y0}, por u shtuan <b>${int(f.dha)} ha</b> zonë e ndërtuar nga 2017.`,`<b>${esc(f.name)}</b>: population fell by <b>${int(-f.dpop)}</b> since ${P.y0}, yet <b>${int(f.dha)} ha</b> of built-up area were added since 2017.`)
    : f.pgr < .25 && f.lcr > f.pgr ? L(`<b>${esc(f.name)}</b>: popullsia është pothuajse e pandryshuar (${sgn(f.pgr,2)} %/vit), ndërsa zona e ndërtuar rritet ${sgn(f.lcr,2)} %/vit. Raporti del shumë i lartë sepse pjesëtohet me një numër afër zeros.`,`<b>${esc(f.name)}</b>: population is almost unchanged (${sgn(f.pgr,2)} %/yr) while the built-up area grows ${sgn(f.lcr,2)} %/yr. The ratio comes out very high because it divides by a number close to zero.`)
    : f.ratio > 1 ? L(`<b>${esc(f.name)}</b>: toka konsumohet <b>${dec(f.ratio,1)} herë</b> më shpejt se rritet popullsia.`,`<b>${esc(f.name)}</b>: land is consumed <b>${dec(f.ratio,1)} times</b> faster than the population grows.`)
    : L(`<b>${esc(f.name)}</b>: popullsia rritet më shpejt se toka e ndërtuar (raporti <b>${dec(f.ratio,2)}</b>).`,`<b>${esc(f.name)}</b>: population grows faster than built-up land (ratio <b>${dec(f.ratio,2)}</b>).`);
  $('sdgPill').innerHTML = `<i style="background:${c.c}"></i>${c.t}`;
  $('sdgPill').style.cssText = `color:${c.c};border-color:${c.c}`;
  $('sdgScope').innerHTML = (picked ? L(`Filtri: ${f.list.length} ${f.list.length === 1 ? C.unit1.one : C.unit1.many} si një e tërë${f.estimate ? ' · <b>përfshin popullsi të vlerësuar</b>' : ''}`,`Filter: ${f.list.length} ${f.list.length === 1 ? C.unit1.one : C.unit1.many} as a whole${f.estimate ? ' · <b>includes estimated population</b>' : ''}`) : L(`${esc(C.whole)}: ${kosovo.count} ${esc(C.unit1.many)}${kosovo.excluded ? `, pa ${kosovo.excluded} me popullsi të vlerësuar` : ''} · zgjidh ${esc(C.unit1.many)} në hartë ose te "Njësitë"`,`${esc(C.whole)}: ${kosovo.count} ${esc(C.unit1.many)}${kosovo.excluded ? `, without ${kosovo.excluded} with estimated population` : ''} · pick ${esc(C.unit1.many)} on the map or under "Units"`))
    + (ZONE.size ? L(` · ${esc(C.unit2.Many)} nuk kanë popullsi, ndaj tregohen ${esc(C.unit1.the)} e tyre`,` · ${esc(C.unit2.Many)} have no population data, so their ${esc(C.unit1.many)} are shown`) : '')
    + (state.radial && !picked ? L(' · rrethi radial nuk përdoret këtu',' · the radial circle is not used here') : '');
  $('sdgKpis').innerHTML = L(`
    <div><span>Popullsia ${P.y1}${popSource === 'census' ? '' : ' (e modeluar)'}</span><strong>${int(f.p24)}</strong><em>${sgn(f.dpop,0)} nga ${P.y0} (${sgn((f.p24/f.p11-1)*100)} %)</em></div>
    <div><span>Zona e ndërtuar, janar 2024</span><strong>${int(f.b24*100)} ha</strong><em>${sgn(f.dha,0)} ha nga 2017 (${sgn((f.b24/f.b17-1)*100)} %)</em></div>
    <div><span>Zonë e ndërtuar për banor</span><strong>${int(f.m2pc)} m²</strong><em>${picked ? `${esc(C.name)}: ${int(kosovo.m2pc)} m²` : 'mesatarja e territorit'}</em></div>
    <div class="sdg-k"><span>SDG 11.3.1 · LCRPGR</span><strong style="color:${c.c}">${f.ratio == null ? '—' : dec(f.ratio,2)}</strong><em>toka ${sgn(f.lcr,2)} %/vit · popullsia ${sgn(f.pgr,2)} %/vit</em></div>`,`
    <div><span>Population ${P.y1}${popSource === 'census' ? '' : ' (modelled)'}</span><strong>${int(f.p24)}</strong><em>${sgn(f.dpop,0)} since ${P.y0} (${sgn((f.p24/f.p11-1)*100)} %)</em></div>
    <div><span>Built-up area, January 2024</span><strong>${int(f.b24*100)} ha</strong><em>${sgn(f.dha,0)} ha since 2017 (${sgn((f.b24/f.b17-1)*100)} %)</em></div>
    <div><span>Built-up area per inhabitant</span><strong>${int(f.m2pc)} m²</strong><em>${picked ? `${esc(C.name)}: ${int(kosovo.m2pc)} m²` : 'territory average'}</em></div>
    <div class="sdg-k"><span>SDG 11.3.1 · LCRPGR</span><strong style="color:${c.c}">${f.ratio == null ? '—' : dec(f.ratio,2)}</strong><em>land ${sgn(f.lcr,2)} %/yr · population ${sgn(f.pgr,2)} %/yr</em></div>`);
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
  $('sdgLegend').innerHTML = ['eff','spr','dec','na'].map(k => `<span${k === 'spr' ? ` class="sdg-def-link" role="button" tabindex="0" title="${L('Shih përkufizimin e zgjerimit të shpërndarë urban','See the definition of urban sprawl')}"` : ''}><i style="background:${k === 'na' ? 'repeating-linear-gradient(45deg,#3a4350 0 3px,#6b7685 3px 5px)' : SDG_CAT[k].c}"></i>${SDG_CAT[k].t} · ${n[k] || 0}</span>`).join('');
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
  s += L(`<text x="${m.l+5}" y="${m.t+11}" style="fill:#d55181;font-weight:700">popullsia bie, toka rritet</text><text x="${X(0)+5}" y="${m.t+11}" style="fill:#c98500;font-weight:700">shpërndarje</text><text x="${W-m.r-4}" y="${H-m.b-6}" text-anchor="end" style="fill:#3987e5;font-weight:700">efikase</text>`,`<text x="${m.l+5}" y="${m.t+11}" style="fill:#d55181;font-weight:700">population falls, land grows</text><text x="${X(0)+5}" y="${m.t+11}" style="fill:#c98500;font-weight:700">sprawl</text><text x="${W-m.r-4}" y="${H-m.b-6}" text-anchor="end" style="fill:#3987e5;font-weight:700">efficient</text>`);
  s += L(`<text x="${(m.l+W-m.r)/2}" y="${H-4}" text-anchor="middle">popullsia, %/vit (${popPeriod().y0}–${popPeriod().y1}) →</text><text transform="translate(9 ${(m.t+H-m.b)/2}) rotate(-90)" text-anchor="middle">toka e ndërtuar, %/vit (2017–2024) →</text></svg><div class="chart-tip" hidden></div>`,`<text x="${(m.l+W-m.r)/2}" y="${H-4}" text-anchor="middle">population, %/yr (${popPeriod().y0}–${popPeriod().y1}) →</text><text transform="translate(9 ${(m.t+H-m.b)/2}) rotate(-90)" text-anchor="middle">built-up land, %/yr (2017–2024) →</text></svg><div class="chart-tip" hidden></div>`);
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
    a.innerHTML = L(`<circle cx="${fx}" cy="${fy}" r="7" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 2"/><text x="${fx+10}" y="${fy+16}" style="fill:#fff;font-weight:700">përzgjedhja</text>`,`<circle cx="${fx}" cy="${fy}" r="7" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 2"/><text x="${fx+10}" y="${fy+16}" style="fill:#fff;font-weight:700">selection</text>`);
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
  const LC = !list.length ? Object.assign({name:C.name,whole:true},landcover.national) : Object.assign({name:filterLabel(list),whole:false},lcSum(list.map(u => landcover[u.level]?.[u.id])));
  LC.total = landcover.classes.map((_,k) => LC.newBuilt.reduce((a,row) => a+row[k],0));
  return LC;
}
const lcIndex = key => landcover.classes.findIndex(c => c.key === key);
function lcBar(total) {
  const sum = total.reduce((a,b) => a+b,0);
  if (!sum) return '<div class="lc-bar empty"><span style="flex:1"></span></div>';
  return `<div class="lc-bar">${landcover.classes.map((c,i) => total[i] > 0 ? `<span style="flex:${total[i]};background:${c.color}" title="${esc(c.label)}: ${haFmt(total[i])} (${pct1(total[i]/sum)})"></span>` : '').join('')}</div>`;
}
// Stacked bars: what each Tracker step's new construction replaced, by class.
function lcYearChart(LC) {
  const st = landcover.steps, W = Math.max(300,$('sdgCards').clientWidth || 480), H = 190, m = {l:44,r:8,t:10,b:40};
  const sums = LC.newBuilt.map(r => r.reduce((a,b) => a+b,0)), max = Math.max(1,...sums);
  const step = (W-m.l-m.r)/st.length, bw = Math.min(26,step*.66), Y = v => m.t+(1-v/max)*(H-m.t-m.b);
  const nice = [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000].find(v => max/v <= 4) || max/4;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="lc-years">`;
  for (let v = 0;v <= max;v += nice) svg += `<line class="grid" x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l-5}" y="${Y(v)+3}" text-anchor="end">${int(v)}</text>`;
  st.forEach((s,i) => {
    const x = m.l+i*step+(step-bw)/2;
    let y = H-m.b;
    landcover.classes.forEach((c,k) => {
      const v = LC.newBuilt[i][k];
      if (v <= 0) return;
      const h = Math.max(0,(H-m.t-m.b)*v/max);
      y -= h;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${c.color}" opacity="${s.exact ? 1 : .5}"><title>${esc(s.label)} · ${esc(c.label)}: ${haFmt(v)}</title></rect>`;
    });
    svg += `<text x="${x+bw/2}" y="${H-m.b+12}" text-anchor="middle">${String(s.label).replace(/^(Janar|Korrik|January|July) /,'').replace(/^20/,'’')}${/^(Korrik|July)/.test(s.label) ? '·VII' : ''}${s.exact ? '' : '*'}</text>`;
  });
  svg += L(`<text x="${m.l}" y="${H-6}">ha të ndërtuara në hapin e Tracker, sipas mbulesës një vit para ndërtimit</text></svg>`,`<text x="${m.l}" y="${H-6}">ha built in each Tracker step, by land cover one year before construction</text></svg>`);
  return svg;
}
function soilCardText() {
  if (!soil) return '';
  const S = soilFocus(), b = soil.best, best = rows => rows.reduce((a,r) => a+r.slice(0,b).reduce((x,y) => x+y,0),0);
  return L(` Në tokë të klasave I–IV u ndërtuan <b>${haFmt(best(S.evolution.slice(1)))}</b> në 1986–2015 dhe <b>${haFmt(best(S.tracker.slice(1)))}</b> pas korrikut 2016.`,` On land of classes I–IV, <b>${haFmt(best(S.evolution.slice(1)))}</b> were built in 1986–2015 and <b>${haFmt(best(S.tracker.slice(1)))}</b> after July 2016.`);
}
function renderSdgCards(f) {
  const LC = landcover ? lcFocus() : null;
  let cards;
  if (LC) {
    const fo = lcIndex('forest'), cr = lcIndex('crop'), ys = landcover.years, Y0 = ys[0], Y1 = ys[ys.length-1];
    const land = row => row.reduce((a,b) => a+b,0), sum = LC.total.reduce((a,b) => a+b,0);
    const sh0 = LC.cover[0][fo]/land(LC.cover[0]), sh1 = LC.cover.at(-1)[fo]/land(LC.cover.at(-1));
    const per = `${landcover.steps[0].label.replace(/^(Janar|Korrik|January|July) /,'')}–${landcover.steps.at(-1).label.replace(/^(Janar|Korrik|January|July) /,'')}`;
    const pp = (sh1-sh0)*100;
    cards = [
      ['15.1.1',L('Pyjet','Forests'),L(`Pyjet zënë <b>${pct1(sh1)}</b> të territorit në ${Y1} (${pp >= 0 ? '+' : '−'}${dec(Math.abs(pp),1)} pikë nga ${Y0}). Ndërtimet e ${per} zunë <b>${haFmt(LC.total[fo])}</b> pyje.`,`Forests cover <b>${pct1(sh1)}</b> of the territory in ${Y1} (${pp >= 0 ? '+' : '−'}${dec(Math.abs(pp),1)} points since ${Y0}). Construction in ${per} took <b>${haFmt(LC.total[fo])}</b> of forest.`),true],
      ['2.4.1 · 15.3.1',L('Toka bujqësore','Farmland'),L(`<b>${haFmt(LC.total[cr])}</b> tokë bujqësore u mbulua me ndërtime në ${per}: ${pct1(sum ? LC.total[cr]/sum : NaN)} e ndërtimeve të reja. Toka e mbuluar humbet përgjithmonë.${soilCardText()}`,`<b>${haFmt(LC.total[cr])}</b> of farmland was covered by construction in ${per}: ${pct1(sum ? LC.total[cr]/sum : NaN)} of new construction. Covered land is lost for good.${soilCardText()}`),true],
      ['11.7.1',L('Gjelbërimi urban','Urban green'),L(`<b>${pct1(LC.green/LC.urban)}</b> e zonës urbane (deri në ${landcover.urbanBufferM} m nga ndërtimet) është pyll, kullotë ose shkurre (${Y1}). Tregues i përafërt: nuk dallon hapësirën publike.`,`<b>${pct1(LC.green/LC.urban)}</b> of the urban area (up to ${landcover.urbanBufferM} m from buildings) is forest, grassland or shrubland (${Y1}). An approximate indicator: it does not distinguish public space.`),true]
    ];
  } else cards = [
    ['15.1.1',L('Pyjet','Forests'),L('Pyje të kthyera në zonë të ndërtuar, viti pas viti. Burimi: Esri 10m Land Cover.','Forest turned into built-up area, year by year. Source: Esri 10m Land Cover.'),false],
    soil ? ['2.4.1 · 15.3.1',L('Toka bujqësore','Farmland'),L(`Ndërtime mbi tokë bujqësore sipas klasave të përshtatshmërisë.${soilCardText()}`,`Construction on farmland by suitability class.${soilCardText()}`),true] : ['2.4.1 · 15.3.1',L('Toka bujqësore','Farmland'),L('Toka bujqësore e mbuluar përgjithmonë. Burimi: Esri 10m Land Cover.','Farmland covered for good. Source: Esri 10m Land Cover.'),false],
    ['11.7.1',L('Gjelbërimi urban','Urban green'),L('Gjelbërimi brenda zonës urbane. Burimi: Esri 10m Land Cover.','Green space inside the urban area. Source: Esri 10m Land Cover.'),false]
  ];
  $('sdgCards').innerHTML = [['11.3.1',L('Toka kundrejt popullsisë','Land versus population'),f.ratio == null ? L(`${SDG_CAT[f.cat].t}: toka ${sgn(f.lcr,2)} %/vit, popullsia ${sgn(f.pgr,2)} %/vit.`,`${SDG_CAT[f.cat].t}: land ${sgn(f.lcr,2)} %/yr, population ${sgn(f.pgr,2)} %/yr.`) : `LCRPGR = ${dec(f.ratio,2)}. ${SDG_CAT[f.cat].d}`,true],...cards]
    .map(([n,h,t,on]) => L(`<div><b>SDG ${n}</b><strong>${h}</strong><span>${t}</span><em class="${on ? 'live' : 'todo'}">${on ? 'LLOGARITUR' : 'KËRKON TË DHËNA'}</em></div>`,`<div><b>SDG ${n}</b><strong>${h}</strong><span>${t}</span><em class="${on ? 'live' : 'todo'}">${on ? 'COMPUTED' : 'NEEDS DATA'}</em></div>`)).join('');
  $('sdgLandState').textContent = LC ? `Esri 10m Land Cover · ${landcover.years[0]}–${landcover.years.at(-1)}` : L('pa të dhëna ende','no data yet');
  if (LC && !$('sdgLandBox').dataset.touched) $('sdgLandBox').open = true;
  if (!LC) {
    $('sdgLand').innerHTML = L(`<p class="note">Kjo pjesë aktivizohet pasi të ndërtohet <code>landcover.json</code> nga harta vjetore e mbulesës së tokës (Esri / Impact Observatory): në GitHub, <i>Actions → Build land cover → Run workflow</i>.</p>`,`<p class="note">This section is enabled once <code>landcover.json</code> is built from the annual land cover map (Esri / Impact Observatory): on GitHub, <i>Actions → Build land cover → Run workflow</i>.</p>`);
    return;
  }
  const N = landcover.national, Ntot = landcover.classes.map((_,k) => N.newBuilt.reduce((a,row) => a+row[k],0));
  const sum = LC.total.reduce((a,b) => a+b,0), nSum = Ntot.reduce((a,b) => a+b,0);
  const ranked = landcover.classes.map((c,i) => ({c,v:LC.total[i]})).filter(x => x.v > 0 && x.c.key !== 'built').sort((a,b) => b.v-a.v);
  const top = ranked.slice(0,2).map(x => `<b>${haFmt(x.v)}</b> ${x.c.label.toLowerCase()}`).join(L(' dhe ',' and '));
  const first = landcover.steps[0].label.toLowerCase(), last = landcover.steps.at(-1).label.toLowerCase();
  const inBuilt = LC.total[lcIndex('built')] || 0;
  $('sdgLand').innerHTML = L(`<p class="story-small"><b>${esc(LC.name)}</b>: nga korriku 2016 deri në ${last} u shtuan <b>${haFmt(sum)}</b> zonë e ndërtuar. <b>${pct1(sum ? inBuilt/sum : NaN)}</b> u ndërtua brenda vendbanimeve ekzistuese (mbushje e oborreve dhe e hapësirave të lira)${top ? `; jashtë tyre u zunë kryesisht ${top}` : ''}.</p>`,`<p class="story-small"><b>${esc(LC.name)}</b>: from July 2016 to ${last}, <b>${haFmt(sum)}</b> of built-up area were added. <b>${pct1(sum ? inBuilt/sum : NaN)}</b> was built inside existing settlements (infill of yards and open plots)${top ? `; outside them it took mainly ${top}` : ''}.</p>`)
    + `<div class="chart lc-chart">${lcYearChart(LC)}</div>`
    + `<div class="choro-legend">${landcover.classes.map(c => `<span><i style="background:${c.color}"></i>${esc(c.label)}</span>`).join('')}</div>`
    + L(`<div class="lc-row"><span>${esc(LC.whole ? C.name : 'Përzgjedhja')}</span>${lcBar(LC.total)}</div>`,`<div class="lc-row"><span>${esc(LC.whole ? C.name : 'Selection')}</span>${lcBar(LC.total)}</div>`)
    + (LC.whole ? '' : `<div class="lc-row ref"><span>${esc(C.name)}</span>${lcBar(Ntot)}</div>`)
    + L(`<table class="lc-table"><thead><tr><th>Mbulesa para ndërtimit</th><th>ha</th><th>%</th>${LC.whole ? '' : `<th>${esc(C.name)} %</th>`}</tr></thead><tbody>`,`<table class="lc-table"><thead><tr><th>Cover before construction</th><th>ha</th><th>%</th>${LC.whole ? '' : `<th>${esc(C.name)} %</th>`}</tr></thead><tbody>`)
    + landcover.classes.map((c,i) => LC.total[i] > 0 || (!LC.whole && Ntot[i] > 0) ? `<tr><td><i style="background:${c.color}"></i>${esc(c.label)}</td><td>${int(LC.total[i])}</td><td>${pct1(sum ? LC.total[i]/sum : NaN)}</td>${LC.whole ? '' : `<td>${pct1(Ntot[i]/nSum)}</td>`}</tr>` : '').join('')
    + `</tbody></table>`
    + L(`<p class="note">Çdo piksel që WSF Tracker e shton në një hap krahasohet me hartën vjetore të mbulesës së tokës të vitit para se të nisë ndërtimi (p.sh. ndërtimet deri në janar 2020 me hartën e 2018). Hapat me * nuk kanë hartë për vitin e duhur (seria mbulon ${landcover.years[0]}–${landcover.years.at(-1)}) dhe përdorin vitin më të afërt: për hapat e parë një pjesë del si "brenda vendbanimit ekzistues". Kjo klasë përfshin ndërtimet e reja në hapësira që harta e Esri i kishte tashmë pjesë të zonës së banuar (oborre, kopshte, parcela brenda fshatrave dhe qyteteve). Vitet e reja të hartës shtohen vetë në përditësimin mujor. ${esc(landcover.source)}.</p>`,`<p class="note">Every pixel that WSF Tracker adds in a step is compared with the annual land cover map of the year before construction began (e.g. construction up to January 2020 with the 2018 map). Steps marked * have no map for the right year (the series covers ${landcover.years[0]}–${landcover.years.at(-1)}) and use the nearest year: for the first steps some of it appears as "inside existing settlement". This class covers new construction in places the Esri map already counted as part of the settled area (yards, gardens, plots inside villages and towns). New map years are added automatically in the monthly update. ${esc(tx(landcover.source))}.</p>`);
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
      svg += L(`<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${soil.colors[k]}"><title>${esc(st[i+1].label)} · klasa ${soil.labels[k]}: ${haFmt(v)}</title></rect>`,`<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${soil.colors[k]}"><title>${esc(st[i+1].label)} · class ${soil.labels[k]}: ${haFmt(v)}</title></rect>`); });
    if (i % every === 0 || i === rows.length-1) svg += `<text x="${x+bw/2}" y="${H-m.b+12}" text-anchor="middle">${String(st[i+1].short || st[i+1].label).replace(/^(Janar|Korrik|January|July) /,'')}</text>`;
  });
  return svg+L(`<text x="${m.l}" y="${H-4}">ha të shtuara në çdo hap, sipas klasës së tokës</text></svg>`,`<text x="${m.l}" y="${H-4}">ha added in each step, by land class</text></svg>`);
}
function renderSoil() {
  const box = $('soilBox');
  box.hidden = !soil;
  if (!soil) return;
  const S0 = soilFocus(), product = state.period === 'tracker' ? 'tracker' : 'evolution', pe = period(product), best = soil.best;
  // Base year: everything built up to the base step counts as the starting stock.
  const off = baseOff(product), S = {...S0};
  if (off) S[product] = [S0[product].slice(0,off+1).reduce((acc,r) => acc.map((v,k) => v+r[k])),...S0[product].slice(off+1)];
  const add = rows => rows.reduce((acc,r) => acc.map((v,k) => v+r[k]),soil.labels.map(() => 0));
  const stock = S[product][0], added = add(S[product].slice(1)), built = stock.map((v,k) => v+added[k]);
  const tot = a => a.reduce((x,y) => x+y,0), bestOf = a => a.slice(0,best).reduce((x,y) => x+y,0);
  const first = pe.steps[0].label, last = pe.steps.at(-1).label;
  $('soilState').textContent = `${product === 'tracker' ? 'WSF Tracker' : 'WSF Evolution'} · ${first} → ${last}`;
  $('soilStory').innerHTML = L(`<b>${esc(S.name)}</b>: pas ${first.toLowerCase().replace(/^korrik/,'korrikut').replace(/^janar/,'janarit')} u ndërtuan <b>${haFmt(tot(added))}</b>, nga të cilat <b>${haFmt(bestOf(added))}</b> (${pct1(bestOf(added)/tot(added))}) në tokë të klasave I–IV, më të mirat për bujqësi. Deri në ${last.toLowerCase()} është ndërtuar <b>${pct1(bestOf(built)/bestOf(S.area))}</b> e tokës së klasave I–IV.`,`<b>${esc(S.name)}</b>: after ${first}, <b>${haFmt(tot(added))}</b> were built, of which <b>${haFmt(bestOf(added))}</b> (${pct1(bestOf(added)/tot(added))}) on land of classes I–IV, the best for farming. By ${last}, <b>${pct1(bestOf(built)/bestOf(S.area))}</b> of class I–IV land had been built on.`);
  $('soilChart').innerHTML = soilChart(S,product);
  $('soilLegend').innerHTML = soil.labels.map((l,k) => `<span><i style="background:${soil.colors[k]}"></i>${l}</span>`).join('')+L('<span style="color:var(--muted)">I = më e përshtatshmja</span>','<span style="color:var(--muted)">I = most suitable</span>');
  $('soilTable').innerHTML = L(`<thead><tr><th>Klasa</th><th>Sipërfaqja ha</th><th>E ndërtuar ${esc(last.replace(/^(Janar|Korrik|January|July) /,''))} ha</th><th>% e klasës</th><th>Shtuar ha</th></tr></thead><tbody>`,`<thead><tr><th>Class</th><th>Area ha</th><th>Built ${esc(yearOnly(last))} ha</th><th>% of class</th><th>Added ha</th></tr></thead><tbody>`)
    + soil.labels.map((l,k) => `<tr${k < best ? ' class="best"' : ''}><td><i style="background:${soil.colors[k]}"></i>${l}</td><td>${int(S.area[k])}</td><td>${int(built[k])}</td><td>${pct1(built[k]/S.area[k])}</td><td>${int(added[k])}</td></tr>`).join('')
    + `<tr class="sum"><td>I–IV</td><td>${int(bestOf(S.area))}</td><td>${int(bestOf(built))}</td><td>${pct1(bestOf(built)/bestOf(S.area))}</td><td>${int(bestOf(added))}</td></tr></tbody>`;
  $('soilNote').textContent = L(`Grafiku ndjek periudhën e zgjedhur në panelin e majtë. WSF Evolution dhe WSF Tracker matin ndryshe, ndaj shifrat e tyre nuk mblidhen. Klasa e tokës merret nga rasteri 50 m në qendrën e çdo pikseli të ndërtuar; vlerat jashtë kufirit maskohen. ${soil.source}`,`The chart follows the period chosen in the left panel. WSF Evolution and WSF Tracker measure differently, so their figures are not added together. The land class is taken from the 50 m raster at the centre of each built-up pixel; values outside the boundary are masked. ${tx(soil.source)}`);
}
function exportSdgCsv() {
  const {rows,kosovo} = sdgAll(), f = sdgFocus();
  const P = popPeriod();
  const head = [L('njesia','unit'),`pop_${P.y0}`,`pop_${P.y1}`,L('popullsia_pct_vit','population_pct_yr'),'ha_2017','ha_2024',L('toka_pct_vit','land_pct_yr'),'lcrpgr',L('m2_per_banor','m2_per_inhabitant'),L('kategoria','category'),L('shenim','note')];
  const line = r => [r.name,r.p11,r.p24,r.pgr.toFixed(3),(r.b17*100).toFixed(1),(r.b24*100).toFixed(1),r.lcr.toFixed(3),r.ratio == null ? '' : r.ratio.toFixed(3),r.m2pc.toFixed(1),SDG_CAT[r.cat].t,r.estimate ? L('popullsi e vleresuar','estimated population') : ''];
  const out = [head,line(kosovo)].concat(f !== kosovo && f.list.length > 1 ? [line(f)] : [],rows.map(line));
  download(new Blob(['﻿'+out.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')],{type:'text/csv'}),`${C.id.toLowerCase()}-sdg-11-3-1-${popSource}.csv`);
}
$('sdgCsv').onclick = exportSdgCsv;
$('sdgSource').onchange = () => { popSource = $('sdgSource').value;sdgCache = null;renderSdg(); };

// ---------- Area of interest: drawn on the map or uploaded (SHP in a .zip, KML, KMZ, GeoJSON) ----------
// state.aoi = {name, parts:[[ring Float64Array lon,lat,...], ...], bbox:[w,s,e,n], areaHa, source, note}
state.aoi = null;
let aoiDraft = null;   // {points:[[lon,lat]...], hover:[lon,lat]|null}
const aoiBbox = parts => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const part of parts) for (const ring of part) for (let i=0;i<ring.length;i+=2) {
    w = Math.min(w,ring[i]);e = Math.max(e,ring[i]);s = Math.min(s,ring[i+1]);n = Math.max(n,ring[i+1]);
  }
  return [w,s,e,n];
};
// Area on the ellipsoid, accurate to well under 1% at this scale (local equal-area scaling per ring).
function ringAreaKm2(ring) {
  let a = 0;
  const lat0 = ring[1]*Math.PI/180, kx = 111.32*Math.cos(lat0), ky = 111.132;
  for (let i=0,j=ring.length-2;i<ring.length;j=i,i+=2) a += (ring[j]*kx)*(ring[i+1]*ky)-(ring[i]*kx)*(ring[j+1]*ky);
  return Math.abs(a)/2;
}
function partAreaKm2(part) { return part.reduce((acc,ring,k) => acc+(k ? -1 : 1)*ringAreaKm2(ring),0); }
function makeAoi(parts,name,source,note='') {
  parts = parts.map(part => part.filter(r => r.length >= 6)).filter(p => p.length);
  if (!parts.length) throw new Error(L('Skedari nuk përmban asnjë poligon.','The file contains no polygon.'));
  const bbox = aoiBbox(parts), [bw,bs,be,bn] = manifest.bounds;
  if (bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90) throw new Error(L('Koordinatat nuk janë gjeografike pas shndërrimit; kontrolloni sistemin koordinativ (.prj).','The coordinates are not geographic after conversion; check the coordinate system (.prj).'));
  if (bbox[2] < bw || bbox[0] > be || bbox[3] < bs || bbox[1] > bn) throw new Error(L(`Zona ndodhet jashtë territorit të atlasit (${C.name}).`,`The zone lies outside the atlas territory (${C.name}).`));
  // Sort rings so the outer one comes first in every part (needed for the area sign).
  for (const part of parts) part.sort((a,b) => ringAreaKm2(b)-ringAreaKm2(a));
  const areaHa = parts.reduce((acc,p) => acc+partAreaKm2(p),0)*100;
  return {name:name || L('Zona e interesit','Zone of interest'),parts,bbox,areaHa,source,note};
}
function setAoi(aoi) {
  state.aoi = aoi;
  if (units) { MUN.clear();ZONE.clear();syncFilter(); }
  try { localStorage.setItem('atlas-aoi-'+C.id,JSON.stringify({name:aoi.name,source:aoi.source,note:aoi.note,parts:aoi.parts.map(p => p.map(r => Array.from(r,v => Math.round(v*1e6)/1e6)))})); } catch {}
  renderAoiBox();
  zoomToUnits([{bbox:aoi.bbox}],aoi.name);
}
function clearAoi(reload=true) {
  if (!state.aoi) return;
  state.aoi = null;
  try { localStorage.removeItem('atlas-aoi-'+C.id); } catch {}
  renderAoiBox();
  if (reload) { refreshFilter();paint(true);updateHash(); }
}
function restoreAoi() {
  try {
    const raw = JSON.parse(localStorage.getItem('atlas-aoi-'+C.id) || 'null');
    if (raw) state.aoi = makeAoi(raw.parts.map(p => p.map(r => Float64Array.from(r))),raw.name,raw.source,raw.note);
  } catch { state.aoi = null; }
  renderAoiBox();
}
function aoiMask(v) {
  const size = v.size, c = size/2, a = state.aoi;
  const draw = document.createElement('canvas');
  draw.width = draw.height = size;
  const ctx = draw.getContext('2d',{willReadFrequently:true});
  const sx = lon => (lon-v.west)/(v.east-v.west)*size, sy = lat => (v.north-lat)/(v.north-v.south)*size;
  ctx.fillStyle = '#fff';
  // Each part is filled on its own (holes by even-odd), so overlapping features add up instead of cancelling.
  for (const part of a.parts) {
    ctx.beginPath();
    for (const ring of part) {
      ctx.moveTo(sx(ring[0]),sy(ring[1]));
      for (let i=2;i<ring.length;i+=2) ctx.lineTo(sx(ring[i]),sy(ring[i+1]));
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  const alpha = ctx.getImageData(0,0,size,size).data, data = new Uint8Array(size*size);
  let radius = 0, inside = 0;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const i = y*size+x;
    if (alpha[i*4+3] > 127) { data[i] = 1;inside++;radius = Math.max(radius,Math.hypot(x+.5-c,y+.5-c)); }
  }
  const [w,s,e,n] = a.bbox, partial = w < v.west || e > v.east || s < v.south || n > v.north;
  return {kind:'aoi',data,radius:Math.max(radius,1),label:a.name,inside,circle:false,partial};
}
function drawAoi() {
  if (!view || (!state.aoi && !aoiDraft)) return;
  const sx = lon => view.x+(lon-view.west)/(view.east-view.west)*view.size;
  const sy = lat => view.y+(view.north-lat)/(view.north-view.south)*view.size;
  const scale = canvas.width/canvas.clientWidth;
  context.save();
  context.beginPath();context.rect(view.x,view.y,view.size,view.size);context.clip();
  context.lineJoin = 'round';
  if (state.aoi) {
    context.beginPath();
    for (const part of state.aoi.parts) for (const ring of part) {
      context.moveTo(sx(ring[0]),sy(ring[1]));
      for (let i=2;i<ring.length;i+=2) context.lineTo(sx(ring[i]),sy(ring[i+1]));
      context.closePath();
    }
    context.fillStyle = 'rgba(255,214,102,.08)';
    context.fill('evenodd');
    context.strokeStyle = '#000a';context.lineWidth = 4.4*scale;context.stroke();
    context.strokeStyle = '#ffd666';context.lineWidth = 2.2*scale;context.stroke();
  }
  context.restore();
}
// Drawing: the preview lives in its own SVG so it follows the pointer without repainting the map.
function renderAoiDraft() {
  const svg = $('aoiDraw');
  if (!aoiDraft || !view) { svg.innerHTML = '';return; }
  const scale = canvas.clientWidth/canvas.width;
  svg.setAttribute('viewBox',`0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
  const P = ([lon,lat]) => [(view.x+(lon-view.west)/(view.east-view.west)*view.size)*scale,(view.y+(view.north-lat)/(view.north-view.south)*view.size)*scale];
  const pts = aoiDraft.points.map(P), hover = aoiDraft.hover ? P(aoiDraft.hover) : null;
  const line = [...pts,...(hover ? [hover] : [])].map(p => p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  let out = '';
  if (pts.length >= 2 || (pts.length && hover)) out += `<polygon points="${line}" class="aoi-fill"/><polyline points="${line}" class="aoi-line"/>`;
  pts.forEach((p,k) => { out += `<circle cx="${p[0]}" cy="${p[1]}" r="${k === 0 && pts.length >= 3 ? 7 : 4.5}" class="aoi-vertex${k === 0 ? ' first' : ''}"/>`; });
  svg.innerHTML = out;
  const n = pts.length;
  $('aoiBarText').textContent = n < 3 ? L(`Kliko në hartë për të shtuar kulmet e zonës (${n} deri tani, duhen të paktën 3).`,`Click on the map to add the zone's vertices (${n} so far, at least 3 needed).`) : L(`${n} kulme · ${number(Math.round(partAreaKm2([Float64Array.from(aoiDraft.points.flat())])*1000)/10)} ha. Kliko kulmin e parë, dy herë klik ose Enter për ta mbyllur.`,`${n} vertices · ${number(Math.round(partAreaKm2([Float64Array.from(aoiDraft.points.flat())])*1000)/10)} ha. Click the first vertex, double-click or press Enter to close it.`);
  $('aoiFinish').disabled = n < 3;
  $('aoiUndo').disabled = !n;
}
function startDraw() {
  aoiDraft = {points:[],hover:null};
  $('aoiBar').hidden = false;
  canvas.classList.add('drawing');
  document.querySelector('.map-wrap').classList.add('aoi-drawing');
  $('aoiDrawBtn').setAttribute('aria-pressed','true');
  renderAoiDraft();
}
function endDraw(commit) {
  const pts = aoiDraft?.points || [];
  aoiDraft = null;
  $('aoiBar').hidden = true;
  canvas.classList.remove('drawing');
  document.querySelector('.map-wrap').classList.remove('aoi-drawing');
  $('aoiDrawBtn').setAttribute('aria-pressed','false');
  renderAoiDraft();
  if (commit && pts.length >= 3) {
    const ring = Float64Array.from([...pts,pts[0]].flat());
    const k = Number(localStorage.getItem?.('atlas-aoi-n') || 0)+1;
    try { localStorage.setItem('atlas-aoi-n',String(k)); } catch {}
    try { setAoi(makeAoi([[ring]],L(`Zona e vizatuar ${k}`,`Drawn zone ${k}`),L('vizatuar në hartë','drawn on the map'))); }
    catch(error) { aoiMessage(error.message,true); }
  } else paint(true);
}
const lonLatAt = event => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX-rect.left)*canvas.width/rect.width-view.x, y = (event.clientY-rect.top)*canvas.height/rect.height-view.y;
  return [view.west+x/view.size*(view.east-view.west),view.north-y/view.size*(view.north-view.south)];
};
function draftClick(event) {
  const p = lonLatAt(event), pts = aoiDraft.points, scale = canvas.clientWidth/canvas.width;
  const px = q => [(q[0]-view.west)/(view.east-view.west)*view.size*scale,(view.north-q[1])/(view.north-view.south)*view.size*scale];
  const near = (a,b,r) => { const A = px(a), B = px(b);return Math.hypot(A[0]-B[0],A[1]-B[1]) < r; };
  if (pts.length >= 3 && near(p,pts[0],10)) { endDraw(true);return; }
  if (pts.length && near(p,pts.at(-1),4)) return;   // second click of a double click
  pts.push(p);
  renderAoiDraft();
}
canvas.addEventListener('pointermove',event => {
  if (!aoiDraft || !view || drag && Math.hypot(event.clientX-drag.x,event.clientY-drag.y) > 4) return;
  aoiDraft.hover = lonLatAt(event);
  renderAoiDraft();
});
canvas.addEventListener('pointerleave',() => { if (aoiDraft) { aoiDraft.hover = null;renderAoiDraft(); } });
document.addEventListener('keydown',event => {
  if (!aoiDraft || /input|select|textarea/i.test(event.target.tagName)) return;
  if (event.key === 'Escape') { event.preventDefault();event.stopImmediatePropagation();endDraw(false); }
  else if (event.key === 'Enter') { event.preventDefault();event.stopImmediatePropagation();endDraw(true); }
  else if (event.key === 'Backspace' || (event.key === 'z' && (event.ctrlKey || event.metaKey))) { event.preventDefault();event.stopImmediatePropagation();aoiDraft.points.pop();renderAoiDraft(); }
},true);

// ---- File reading ----
async function unzip(buffer) {
  const bytes = new Uint8Array(buffer), dv = new DataView(buffer), files = new Map();
  let eocd = -1;
  for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if (dv.getUint32(i,true) === 0x06054b50) { eocd = i;break; }
  if (eocd < 0) throw new Error(L('Arkivi .zip nuk lexohet.','The .zip archive cannot be read.'));
  let p = dv.getUint32(eocd+16,true);
  const total = dv.getUint16(eocd+10,true);
  for (let k=0;k<total;k++) {
    if (dv.getUint32(p,true) !== 0x02014b50) break;
    const method = dv.getUint16(p+10,true), csize = dv.getUint32(p+20,true);
    const nlen = dv.getUint16(p+28,true), elen = dv.getUint16(p+30,true), clen = dv.getUint16(p+32,true), local = dv.getUint32(p+42,true);
    const name = new TextDecoder().decode(bytes.subarray(p+46,p+46+nlen));
    p += 46+nlen+elen+clen;
    if (name.endsWith('/') || /(^|\/)__MACOSX\//.test(name)) continue;
    const start = local+30+dv.getUint16(local+26,true)+dv.getUint16(local+28,true), raw = bytes.slice(start,start+csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    files.set(name,data);
  }
  return files;
}
// Projections: WGS84, Web Mercator and every Transverse Mercator (UTM, Gauss-Krüger, KOSOVAREF01, KRGJSH, MGI Balkans).
const ELL = {wgs84:[6378137,1/298.257223563],grs80:[6378137,1/298.257222101],bessel:[6377397.155,1/299.1528128],hayford:[6378388,1/297],krassowsky:[6378245,1/298.3]};
function tmInverse(x,y,o) {
  const {a,f,lon0,lat0,k0,fe,fn} = o, e2 = f*(2-f), ep2 = e2/(1-e2), e4 = e2*e2, e6 = e4*e2;
  const M = phi => a*((1-e2/4-3*e4/64-5*e6/256)*phi-(3*e2/8+3*e4/32+45*e6/1024)*Math.sin(2*phi)+(15*e4/256+45*e6/1024)*Math.sin(4*phi)-(35*e6/3072)*Math.sin(6*phi));
  const mu = (M(lat0)+(y-fn)/k0)/(a*(1-e2/4-3*e4/64-5*e6/256)), e1 = (1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const phi1 = mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1), C1 = ep2*c*c, T1 = t*t;
  const N1 = a/Math.sqrt(1-e2*s*s), R1 = a*(1-e2)/(1-e2*s*s)**1.5, D = (x-fe)/(N1*k0);
  const lat = phi1-(N1*t/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
  const lon = lon0+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/c;
  return [lon,lat];
}
// Datum shift to WGS84 (position-vector Helmert; rotations in arc-seconds, scale in ppm).
function helmert(lon,lat,ell,p) {
  const [a,f] = ell, e2 = f*(2-f), sl = Math.sin(lat), N = a/Math.sqrt(1-e2*sl*sl);
  const X = N*Math.cos(lat)*Math.cos(lon), Y = N*Math.cos(lat)*Math.sin(lon), Z = N*(1-e2)*sl;
  const [tx,ty,tz,rx=0,ry=0,rz=0,ds=0] = p, r = Math.PI/648000, k = 1+ds*1e-6;
  const X2 = tx+k*(X-rz*r*Y+ry*r*Z), Y2 = ty+k*(rz*r*X+Y-rx*r*Z), Z2 = tz+k*(-ry*r*X+rx*r*Y+Z);
  const [A,F] = ELL.wgs84, E2 = F*(2-F), P = Math.hypot(X2,Y2);
  let la = Math.atan2(Z2,P*(1-E2));
  for (let i=0;i<6;i++) { const s = Math.sin(la), n = A/Math.sqrt(1-E2*s*s);la = Math.atan2(Z2+E2*n*s,P); }
  return [Math.atan2(Y2,X2),la];
}
function projectionFromPrj(wkt) {
  if (!wkt) return null;
  const num = v => Number(v), deg = Math.PI/180;
  const sph = /(?:SPHEROID|ELLIPSOID)\[\s*"([^"]*)"\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)/i.exec(wkt);
  const ell = sph ? [num(sph[2]),num(sph[3]) ? 1/num(sph[3]) : 0] : ELL.wgs84;
  const datum = (/DATUM\[\s*"([^"]*)"/i.exec(wkt) || [,''])[1];
  let towgs = /TOWGS84\[([^\]]+)\]/i.exec(wkt)?.[1].split(',').map(Number);
  let note = '';
  if (!towgs && /MGI|Hermannskogel/i.test(datum)) { towgs = [682,-203,480];note = L('Datumi MGI 1901 u shndërrua me parametrat e përafërt 682, −203, 480 m (saktësi rreth 5 m).','The MGI 1901 datum was converted with the approximate parameters 682, −203, 480 m (accuracy about 5 m).'); }
  if (towgs && towgs.every(v => !v)) towgs = null;
  const shift = towgs ? (lon,lat) => helmert(lon,lat,ell,towgs) : (lon,lat) => [lon,lat];
  if (!/^\s*PROJ(CS|CRS)/i.test(wkt)) {
    return {name:(/^\s*GEOG\w*\[\s*"([^"]*)"/i.exec(wkt) || [,'gjeografik'])[1],note,fn:(x,y) => { const [l,b] = shift(x*deg,y*deg);return [l/deg,b/deg]; }};
  }
  const proj = (/PROJECTION\[\s*"([^"]*)"/i.exec(wkt) || /METHOD\[\s*"([^"]*)"/i.exec(wkt) || [,''])[1];
  const P = {};
  for (const m of wkt.matchAll(/PARAMETER\[\s*"([^"]+)"\s*,\s*([\d.eE+-]+)/gi)) P[m[1].toLowerCase().replace(/[\s_]+/g,'_')] = num(m[2]);
  const units = [...wkt.matchAll(/(?:UNIT|LENGTHUNIT)\[\s*"([^"]*)"\s*,\s*([\d.eE+-]+)/gi)], unit = units.length ? num(units.at(-1)[2]) || 1 : 1;
  const name = (/^\s*PROJ\w*\[\s*"([^"]*)"/i.exec(wkt) || [,proj])[1];
  if (/transverse|gauss|tm\b/i.test(proj)) {
    const o = {a:ell[0],f:ell[1],lon0:(P.central_meridian ?? P.longitude_of_natural_origin ?? P.longitude_of_origin ?? 0)*deg,lat0:(P.latitude_of_origin ?? P.latitude_of_natural_origin ?? 0)*deg,
      k0:P.scale_factor ?? P.scale_factor_at_natural_origin ?? 1,fe:P.false_easting ?? 0,fn:P.false_northing ?? 0};
    return {name,note,fn:(x,y) => { const [l,b] = tmInverse(x*unit,y*unit,o);const [L,B] = shift(l,b);return [L/deg,B/deg]; }};
  }
  if (/mercator/i.test(proj) && /auxiliary|pseudo|popular|web|3857/i.test(proj+name)) {
    const R = 6378137;
    return {name,note,fn:(x,y) => [x*unit/R/deg,(2*Math.atan(Math.exp(y*unit/R))-Math.PI/2)/deg]};
  }
  throw new Error(L(`Projeksioni "${proj || name}" nuk mbështetet. Ruajeni skedarin në WGS84 (EPSG:4326) ose në një sistem Transverse Mercator (p.sh. UTM, KOSOVAREF01).`,`The projection "${proj || name}" is not supported. Save the file in WGS84 (EPSG:4326) or in a Transverse Mercator system (e.g. UTM, KOSOVAREF01).`));
}
// Without a .prj, guess from the coordinate range.
function guessProjection(x,y) {
  const deg = Math.PI/180;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return null;
  if (x > 7.2e6 && x < 7.8e6 && y > 4.3e6 && y < 4.9e6)
    return {name:'KOSOVAREF01 / Balkans zone 7 (EPSG:9141)'+L(', i supozuar',', assumed'),fn:(a,b) => tmInverse(a,b,{a:ELL.grs80[0],f:ELL.grs80[1],lon0:21*deg,lat0:0,k0:.9999,fe:7500000,fn:0}).map(v => v/deg)};
  if (x > 1e5 && x < 9e5 && y > 4.3e6 && y < 4.9e6)
    return {name:'WGS 84 / UTM 34N (EPSG:32634)'+L(', i supozuar',', assumed'),fn:(a,b) => tmInverse(a,b,{a:ELL.wgs84[0],f:ELL.wgs84[1],lon0:21*deg,lat0:0,k0:.9996,fe:5e5,fn:0}).map(v => v/deg)};
  if (x > 1.5e6 && x < 3.2e6 && y > 4.7e6 && y < 5.7e6)
    return {name:'Web Mercator (EPSG:3857)'+L(', i supozuar',', assumed'),fn:(a,b) => [a/6378137/deg,(2*Math.atan(Math.exp(b/6378137))-Math.PI/2)/deg]};
  throw new Error(L('Sistemi koordinativ nuk njihet dhe skedari .prj mungon. Shtoni .prj në zip ose ruajeni në WGS84.','The coordinate system is unknown and the .prj file is missing. Add the .prj to the zip or save in WGS84.'));
}
function parseShp(buffer) {
  const dv = new DataView(buffer);
  if (dv.getInt32(0,false) !== 9994) throw new Error(L('Skedari .shp nuk është i vlefshëm.','The .shp file is not valid.'));
  const type = dv.getInt32(32,true);
  if (![5,15,25].includes(type)) throw new Error(L('Shapefile duhet të jetë me poligone (jo pika ose vija).','The shapefile must contain polygons (not points or lines).'));
  const parts = [];
  let p = 100;
  while (p+8 <= buffer.byteLength) {
    const len = dv.getInt32(p+4,false)*2, c = p+8;
    p = c+len;
    if (len < 4 || dv.getInt32(c,true) === 0) continue;
    const nParts = dv.getInt32(c+36,true), nPts = dv.getInt32(c+40,true), pts = c+44+4*nParts;
    const starts = Array.from({length:nParts},(_,k) => dv.getInt32(c+44+4*k,true));
    // Rings of one record form one feature: outer rings clockwise, holes counter-clockwise.
    const feature = [];
    for (let k=0;k<nParts;k++) {
      const a = starts[k], b = k+1 < nParts ? starts[k+1] : nPts, ring = new Float64Array((b-a)*2);
      for (let i=a;i<b;i++) { ring[(i-a)*2] = dv.getFloat64(pts+16*i,true);ring[(i-a)*2+1] = dv.getFloat64(pts+16*i+8,true); }
      feature.push(ring);
    }
    // Split a record with several outer rings into parts (a ring's sign tells outer from hole).
    const signed = r => { let s = 0;for (let i=0,j=r.length-2;i<r.length;j=i,i+=2) s += (r[j]-r[i])*(r[j+1]+r[i+1]);return s; };
    let cur = null;
    for (const ring of feature) { if (signed(ring) > 0 || !cur) { cur = [ring];parts.push(cur); } else cur.push(ring); }
  }
  return parts;
}
// First record's name-like text field from the .dbf (NAME, EMRI, …); null when there is none.
function dbfName(bytes,count) {
  try {
    const dv = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), headLen = dv.getUint16(8,true), recLen = dv.getUint16(10,true);
    const fields = [];
    for (let p = 32,off = 1;p+32 <= headLen && bytes[p] !== 0x0d;p += 32) {
      const name = new TextDecoder().decode(bytes.subarray(p,p+11)).replace(/\0.*$/,''), type = String.fromCharCode(bytes[p+11]), len = bytes[p+16];
      fields.push({name,type,off,len});off += len;
    }
    const f = fields.find(f => f.type === 'C' && /^(name|emri|emer|emertimi|naziv|ime|komuna|municipali|zona|title|label)/i.test(f.name));
    if (!f || count < 1) return null;
    const v = new TextDecoder().decode(bytes.subarray(headLen+f.off,headLen+f.off+f.len)).trim();
    return v || null;
  } catch { return null; }
}
function projectParts(parts,proj) {
  if (!proj) return parts;
  return parts.map(part => part.map(ring => { const out = new Float64Array(ring.length);for (let i=0;i<ring.length;i+=2) { const [l,b] = proj.fn(ring[i],ring[i+1]);out[i] = l;out[i+1] = b; }return out; }));
}
function parseKml(text) {
  const doc = new DOMParser().parseFromString(text,'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(L('Skedari KML nuk lexohet.','The KML file cannot be read.'));
  const coords = el => Float64Array.from((el?.textContent || '').trim().split(/\s+/).filter(Boolean).flatMap(t => t.split(',').slice(0,2).map(Number)));
  const parts = [];
  for (const poly of doc.getElementsByTagNameNS('*','Polygon')) {
    const outer = poly.getElementsByTagNameNS('*','outerBoundaryIs')[0]?.getElementsByTagNameNS('*','coordinates')[0];
    const inner = [...poly.getElementsByTagNameNS('*','innerBoundaryIs')].map(b => b.getElementsByTagNameNS('*','coordinates')[0]);
    if (outer) parts.push([coords(outer),...inner.map(coords)]);
  }
  const name = doc.getElementsByTagNameNS('*','Placemark')[0]?.getElementsByTagNameNS('*','name')[0]?.textContent?.trim() || doc.getElementsByTagNameNS('*','name')[0]?.textContent?.trim();
  return {parts,name};
}
function parseGeoJson(obj) {
  const parts = [], ring = r => Float64Array.from(r.flatMap(c => [c[0],c[1]]));
  const walk = g => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach(f => walk(f.geometry));
    else if (g.type === 'Feature') walk(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
    else if (g.type === 'Polygon') parts.push(g.coordinates.map(ring));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => parts.push(p.map(ring)));
  };
  walk(obj);
  const crs = obj.crs?.properties?.name || '';
  const name = obj.name || obj.features?.[0]?.properties?.name || obj.features?.[0]?.properties?.emri || obj.properties?.name;
  return {parts,name,crs};
}
async function readAoiFiles(fileList) {
  const files = new Map();
  for (const f of fileList) {
    const lower = f.name.toLowerCase();
    if (/\.(zip|kmz)$/.test(lower)) for (const [n,d] of await unzip(await f.arrayBuffer())) files.set(n.split('/').pop(),{data:d,from:f.name});
    else files.set(f.name,{data:new Uint8Array(await f.arrayBuffer()),from:f.name});
  }
  const find = ext => [...files.keys()].filter(n => n.toLowerCase().endsWith(ext));
  const base = n => n.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
  const text = d => new TextDecoder().decode(d);
  const shp = find('.shp'), kml = find('.kml'), gj = [...find('.geojson'),...find('.json')];
  if (shp.length) {
    const stem = shp[0].replace(/\.shp$/i,''), prjName = [...files.keys()].find(n => n.toLowerCase() === stem.toLowerCase()+'.prj') || find('.prj')[0];
    const d = files.get(shp[0]).data;
    let parts = parseShp(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength));
    if (!parts.length) throw new Error(L('Shapefile nuk përmban poligone.','The shapefile contains no polygons.'));
    const proj = prjName ? projectionFromPrj(text(files.get(prjName).data)) : guessProjection(parts[0][0][0],parts[0][0][1]);
    parts = projectParts(parts,proj);
    const dbf = [...files.keys()].find(n => n.toLowerCase() === stem.toLowerCase()+'.dbf');
    const label = (dbf && dbfName(files.get(dbf).data,1)) || base(shp[0]);
    return makeAoi(parts,label,`Shapefile · ${proj ? proj.name : 'WGS84'}`,[!prjName && proj ? L('Skedari .prj mungon: sistemi u përcaktua nga vlerat e koordinatave.','The .prj file is missing: the system was inferred from the coordinate values.') : '',proj?.note || ''].filter(Boolean).join(' '));
  }
  if (kml.length) {
    const r = parseKml(text(files.get(kml[0]).data));
    if (!r.parts.length) throw new Error(L('KML nuk përmban poligone (Polygon).','The KML contains no polygons (Polygon).'));
    return makeAoi(r.parts,r.name || base(files.get(kml[0]).from),'KML · WGS84');
  }
  if (gj.length) {
    const r = parseGeoJson(JSON.parse(text(files.get(gj[0]).data)));
    if (!r.parts.length) throw new Error(L('GeoJSON nuk përmban poligone.','The GeoJSON contains no polygons.'));
    let proj = null;
    const m = /EPSG::?(\d+)/i.exec(r.crs);
    if (m && m[1] !== '4326' && m[1] !== '4258') proj = guessProjection(r.parts[0][0][0],r.parts[0][0][1]);
    return makeAoi(projectParts(r.parts,proj),r.name || base(gj[0]),`GeoJSON · ${proj ? proj.name : 'WGS84'}`);
  }
  if (find('.dbf').length || find('.shx').length) throw new Error(L('Mungon skedari .shp. Zgjidhni .shp, .shx, .dbf dhe .prj së bashku, ose një .zip me to.','The .shp file is missing. Select .shp, .shx, .dbf and .prj together, or a .zip containing them.'));
  throw new Error(L('Formati nuk njihet. Përdorni .zip me shapefile, .shp (me .prj), .kml, .kmz ose .geojson.','Unknown format. Use a .zip with a shapefile, .shp (with .prj), .kml, .kmz or .geojson.'));
}
function aoiMessage(text,error=false) {
  $('aoiMsg').hidden = !text;
  $('aoiMsg').textContent = text || '';
  $('aoiMsg').classList.toggle('error',error);
}
function renderAoiBox() {
  const a = state.aoi;
  $('aoiActive').hidden = !a;
  if (!a) return;
  $('aoiName').textContent = a.name;
  $('aoiMeta').textContent = `${number(Math.round(a.areaHa*10)/10)} ha · ${a.parts.length} ${a.parts.length === 1 ? 'poligon' : 'poligone'} · ${a.source}`;
  $('aoiNote').hidden = !a.note;
  $('aoiNote').textContent = a.note || '';
}
function exportAoiGeoJson() {
  const a = state.aoi;
  if (!a) return;
  const ring = r => { const out = [];for (let i=0;i<r.length;i+=2) out.push([Math.round(r[i]*1e7)/1e7,Math.round(r[i+1]*1e7)/1e7]);return out; };
  const gj = {type:'FeatureCollection',name:a.name,features:[{type:'Feature',properties:{name:a.name,area_ha:Math.round(a.areaHa*100)/100,source:a.source},geometry:{type:'MultiPolygon',coordinates:a.parts.map(p => p.map(ring))}}]};
  download(new Blob([JSON.stringify(gj)],{type:'application/geo+json'}),L(`zona-${normalize(a.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'interesi'}.geojson`,`zone-${normalize(a.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'of-interest'}.geojson`));
}
// CSV for the analysed zone: every step, plus the direction split of the radial diagram.
function exportZoneCsv() {
  const z = zoneStatistics(), s = viewStats;
  if (!z || !s) return;
  const fm = s.filter, steps = period().steps;
  const zone = !fm ? L('pamja e hartës','map view') : fm.kind === 'aoi' ? fm.label : fm.kind === 'circle' ? L(`rrethi ${number(Math.round(s.lensKm*10)/10)} km rreth ${state.name}`,`circle ${number(Math.round(s.lensKm*10)/10)} km around ${state.name}`) : fm.label;
  const dirs = [L('veri','north'),L('lindje','east'),L('jug','south'),L('perendim','west')];
  const head = [L('zona','zone'),L('periudha','period'),L('viti_baze','base_year'),L('siperfaqja_e_zones_ha','zone_area_ha'),L('hapi','step'),L('viti','year'),L('ndertuar_ha','built_ha'),L('perqindja_e_zones','share_of_zone_pct'),L('shtesa_ha','added_ha'),L('rritja_perqind','growth_pct'),...dirs.map(d => L('shtesa_','added_')+d+'_ha')];
  const r2 = v => v == null ? '' : Math.round(v*100)/100;
  const lines = z.rows.map((r,k) => [zone,period().source,steps[0].label,r2(z.landHa),r.label,steps[k].year,r2(r.builtHa),r2(r.share),k ? r2(r.addHa) : '',k ? r2(r.rate) : '',
    ...s.radial.map(dir => k ? r2(dir.reduce((acc,band) => acc+band[k+1],0)*100) : '')]);
  const q = v => /[",;\n]/.test(String(v)) ? '"'+String(v).replace(/"/g,'""')+'"' : String(v);
  const body = [head,...lines].map(r => r.map(q).join(',')).join('\n');
  const slug = normalize(zone).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50) || L('zona','zone');
  download(new Blob(['﻿'+body],{type:'text/csv;charset=utf-8'}),`${L('atlasi-urban','urban-atlas')}-${slug}-${state.period}-${steps[0].short}-${steps.at(-1).short}.csv`);
}
$('aoiDrawBtn').onclick = () => aoiDraft ? endDraw(false) : startDraw();
$('aoiFinish').onclick = () => endDraw(true);
$('aoiCancel').onclick = () => endDraw(false);
$('aoiUndo').onclick = () => { aoiDraft?.points.pop();renderAoiDraft(); };
$('aoiUploadBtn').onclick = () => $('aoiFile').click();
$('aoiFile').onchange = async () => {
  const list = [...$('aoiFile').files];
  $('aoiFile').value = '';
  if (!list.length) return;
  aoiMessage(L('Duke lexuar skedarin…','Reading the file…'));
  try { const aoi = await readAoiFiles(list);aoiMessage('');setAoi(aoi); }
  catch(error) { console.error(error);aoiMessage(error.message || L('Skedari nuk u lexua.','The file could not be read.'),true); }
};
$('aoiZoom').onclick = () => state.aoi && zoomToUnits([{bbox:state.aoi.bbox}],state.aoi.name);
$('aoiClear').onclick = () => clearAoi();
$('aoiGeojson').onclick = exportAoiGeoJson;
$('zoneCsv').onclick = exportZoneCsv;
// Drop files on the map to load them as the zone of interest.
document.querySelector('.map-wrap').addEventListener('dragover',event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault();document.querySelector('.map-wrap').classList.add('dropping'); } });
document.querySelector('.map-wrap').addEventListener('dragleave',() => document.querySelector('.map-wrap').classList.remove('dropping'));
document.querySelector('.map-wrap').addEventListener('drop',async event => {
  event.preventDefault();
  document.querySelector('.map-wrap').classList.remove('dropping');
  const list = [...event.dataTransfer.files];
  if (!list.length) return;
  aoiMessage(L('Duke lexuar skedarin…','Reading the file…'));
  try { const aoi = await readAoiFiles(list);aoiMessage('');setAoi(aoi); }
  catch(error) { console.error(error);aoiMessage(error.message || L('Skedari nuk u lexua.','The file could not be read.'),true); }
});

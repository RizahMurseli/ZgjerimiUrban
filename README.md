# Observatori Urban i Kosovës

Aplikacion interaktiv në shqip për eksplorimin e zonave të ndërtuara në çdo pikë të Kosovës, nga viti 1985 deri në 2026, i zgjerueshëm për çdo shtet me të dhëna globale.

**Autori:** Rizah Murseli · koncepti, analiza dhe zhvillimi

> Si ta citoni (Chicago): Murseli, Rizah. *Observatori Urban i Kosovës: Zgjerimi urban, format e tij, SDG dhe skenarë planifikimi, 1985–2030*. Atlas interaktiv. 2026. https://rizahmurseli.github.io/ZgjerimiUrban/.
>
> Të dhënat: DLR World Settlement Footprint (Marconcini et al. 2020; Marconcini et al. 2021; DLR dhe MindEarth, WSF Tracker 2026).

## Nisja lokale

Python 3.10 ose më i ri mjafton për ta shërbyer aplikacionin. Të dhënat e përgatitura janë të përfshira.

```sh
python -m http.server 8765 --directory dist
```

Hapni [aplikacionin lokal](http://localhost:8765). Shërbejeni përmes HTTP, që shfletuesi të mund të lexojë skedarët e të dhënave.

## Përdorimi

- Kërkoni qytet ose fshat në katalogun me rreth 2 600 emra. Kërkimi pranon edhe variante pa shenja diakritike dhe emra alternativë.
- Zgjidhni pikën në hartën e vogël nëse vendbanimi mungon në katalog.
- Zgjidhni 1985–2015 ose 2016–2026.
- Ndryshoni dritaren nga 2 në 30 km, përdorni zmadhimin ose shfaqni gjithë Kosovën.
- Luajeni animacionin ose zgjidhni vitin individualisht.
- Adresa e faqes ruan vendin, mbulimin, produktin dhe mënyrën e shfaqjes për ndarje të pamjes.
- Kaloni miun mbi hartë për të parë vitin kur u identifikua ndërtimi në atë pikë.
- Mënyrat e hartës: **Gjendja** (kumulative), **Shtesat e vitit** (vetëm pikselët e rinj të vitit të zgjedhur theksohen) dhe **Krahaso** (rrëshqitës majtas/djathtas mes dy viteve).
- Shkurtore: ← → për vitin, hapësira për të luajtur.

### Diagrami radial

Rreth një rrethi në qendër të hartës vizatohen katër grafikë, një për çdo drejtim (veri, lindje, jug, perëndim). Koha ecën në drejtim të akrepave të orës përgjatë secilit hark. Lartësia tregon sipërfaqen e shtuar çdo vit brenda rrethit në atë drejtim. Ngjyrat ndajnë shtesat sipas largësisë nga qendra: afër qendrës (brenda), në mes dhe në skaj (jashtë). Kështu shihet menjëherë në cilin drejtim po zgjerohet vendbanimi dhe kur. Rrezja e rrethit është 27% e mbulimit të hartës. Kalimi me miun tregon vlerat; klikimi zgjedh vitin. Ideja vjen nga hartat me grafikë radialë rreth një lenteje.

### Harta bazë

Nën zonat e ndërtuara shfaqet harta e [OpenStreetMap](https://www.openstreetmap.org/copyright), e errësuar që ngjyrat e viteve të mbeten të lexueshme. Butonat **Diagrami radial** dhe **Harta OSM** i ndezin dhe i fikin shtresat. Ofruesi i pllakave caktohet nga konstantja `TILE_URL` në `dist/app.js`. Serverët publikë të OSM janë për përdorim të moderuar, sipas [politikës së përdorimit të pllakave](https://operations.osmfoundation.org/policies/tiles/). Nëse faqja merr shumë vizita, kaloni te një ofrues tjetër dhe përditësoni atribuimin.

### Paneli i analizës

- **Kjo zonë**: përmbledhje automatike, rritja, viti më aktiv, kurba kumulative, shtesat vjetore dhe profili sipas largësisë nga qendra (qendër apo periferi). Klikimi në grafik zgjedh vitin.
- **Komunat**: garë animuese e 38 qendrave komunale brenda rrezes 5 km, e renditur sipas sipërfaqes, rritjes % ose shtesës vjetore. Klikimi hap qendrën.
- **Kosova**: kurbat kombëtare për të dy produktet, me shënime për 1999 dhe 2008, dhe 12 vendbanimet me shtesën më të madhe brenda 1 km.

## Harta bazë

Në panelin e majtë, seksioni **Harta bazë** ka tri kontrolle:

- **Burimi**: OpenStreetMap, Esri World Imagery (imazh satelitor) ose pa hartë bazë.
- **Paraqitja e sfondit**: *E errët* (thekson ngjyrat e viteve), *RGB* (ngjyrat natyrore) ose *Pankromatike* (bardhë e zi, si imazh pankromatik).
- **Transparenca**: 0–95 %.

Kur zgjidhni Esri me paraqitjen e errët, paraqitja kalon vetë në RGB. Zgjedhjet ruhen në adresë (`b`, `bm`, `bt`) dhe kreditimi i burimit shfaqet në hartë dhe në eksportin PNG/SVG. Imazhet e Esri kërkojnë kreditim dhe u nënshtrohen [kushteve të përdorimit të Esri](https://www.esri.com/en-us/legal/terms/full-master-agreement).

## Qëndrueshmëria (SDG 11.3.1)

Skeda **Qëndrueshmëria** krahason zgjerimin e zonës së ndërtuar me ndryshimin e popullsisë sipas treguesit SDG 11.3.1 të UN-Habitat (raporti mes shpejtësisë së konsumit të tokës dhe shpejtësisë së rritjes së popullsisë):

- `LCR = ln(T2024/T2017)/7` nga WSF Tracker (janar 2017 → janar 2024);
- `PGR = ln(P2024/P2011)/13` nga regjistrimet e ASK 2011 dhe 2024 (`data/population.json`);
- `LCRPGR = LCR/PGR`. Kur popullsia bie, raporti nuk ka kuptim dhe njësia renditet te "zgjerim me popullsi në rënie".

Skeda ndjek të njëjtin filtër si harta dhe "Njësitë": pa zgjedhje tregon Kosovën (34 komuna, pa veriun); me komuna të zgjedhura i trajton si një të tërë. Kliko në hartën e skedës për të shtuar ose hequr komuna nga filtri. Popullsia njihet vetëm për komunat, ndaj zonat kadastrale dhe rrethi radial nuk përdoren këtu. Për katër komunat veriore të dy vitet janë vlerësime të ASK.

Moduli "Mbi çfarë u ndërtua?" llogaritet nga seria vjetore Esri 10m Land Cover (shih më poshtë).

## Shtete të tjera (të dhëna globale)

Atlasi punon me "paketa shtetesh" në `dist/data/<ISO3>/`. Kur ka më shumë se një paketë, në panelin e majtë shfaqet përzgjedhësi **Shteti**; adresa e faqes e mban shtetin (`#c=ALB`).

Çdo paketë ndërtohet automatikisht nga burime globale të hapura:

| Pjesa | Burimi |
|---|---|
| Zgjerimi 1985–2015 | DLR WSF Evolution, skedarë 2°×2° |
| Zgjerimi 2016–2026 | DLR WSF Tracker, shërbimi WMS |
| Kufiri dhe njësitë | geoBoundaries gbOpen (ADM0–ADM3); Kosova: kufijtë e AKK në `data-src/` |
| Vendbanimet | GeoNames, sipas kodit të shtetit |
| Popullsia | GHS-POP R2023A (3″, epokat 1990–2025); Kosova: edhe regjistrimet e ASK |

Shtetet, emrat në shqip dhe termat e njësive (komunë, bashki, njësi administrative…) janë te `scripts/countries.json`. Nga nivelet e geoBoundaries, si nivel i parë zgjidhet më i trashi që ka 15–400 njësi; niveli i dytë (opsional) është niveli pasues me deri në 4000 njësi. Qendrat e njësive merren si vendbanimi më i madh i GeoNames në secilën, përveç Kosovës, që ka listën e vet.

**Ndërtimi:** *Actions → Build country packs → Run workflow*, me kodet p.sh. `ALB,MKD`. Workflow-i teston fillimisht tubacionin me një shtet sintetik, ndërton paketat (deri në dy njëkohësisht), i ruan në repository dhe e ripublikon faqen. Shkarkimet janë të mëdha (GHS-POP rreth 100–160 MB për pllakë dhe epokë), ndaj ruhen në cache. Workflow-i mujor i përditëson të gjitha paketat kur DLR shton hapa të rinj.

Për të shtuar një shtet tjetër, shtoni një hyrje te `scripts/countries.json` (kodi ISO3, kodi GeoNames dhe emërtimet) dhe nisni workflow-in me kodin e tij.

Në skedën **Qëndrueshmëria**, për shtetet pa regjistrim popullsia vjen nga GHS-POP, e interpoluar në 2017 dhe 2024 për të përputhur periudhën e WSF Tracker. GHS-POP është popullsi e modeluar që shpërndahet sipas zonave të ndërtuara, ndaj krahasimi me zonën e ndërtuar është pjesërisht qarkor. Për Kosovën mund të zgjidhni mes regjistrimit dhe GHS-POP.

## Mbulesa e tokës nën ndërtimet e reja (Esri 10m Land Cover)

Pjesa "Mbi çfarë u ndërtua?" dhe kartat SDG 15.1.1, 2.4.1/15.3.1 dhe 11.7.1 të skedës **Qëndrueshmëria** lexojnë `dist/data/<ISO3>/landcover.json`. Ky skedar llogaritet nga seria vjetore **Esri / Impact Observatory Sentinel-2 10m Land Use/Land Cover** (9 klasa, CC BY 4.0), me një hartë për çdo vit që nga 2017 dhe me të njëjtin model për të gjitha vitet:

- **Mbi çfarë u ndërtua:** çdo piksel që WSF Tracker e shton në një hap krahasohet me hartën e vitit para nisjes së ndërtimit (hapi i janarit Y → harta e vitit Y−2). Rezultati jepet për çdo hap dhe gjithsej. Hapat pa hartë për vitin e duhur (p.sh. 2017) përdorin vitin më të afërt dhe shënohen me *.
- **SDG 15.1.1:** pjesa e territorit me pyje në vitin e fundit, ndryshimi që nga 2017 dhe hektarët e pyjeve të zëna nga ndërtimet.
- **SDG 2.4.1 / 15.3.1:** toka bujqësore e mbuluar me ndërtime (humbje e përhershme e tokës).
- **SDG 11.7.1 (tregues i përafërt):** pjesa e pyjeve, kullotave dhe shkurreve brenda zonës urbane (deri në 100 m nga zona e ndërtuar). Nuk dallon hapësirën publike nga ajo private.

Shifrat jepen për shtetin dhe për çdo njësi të dy niveleve, dhe ndjekin filtrin e atlasit. Hartat nuk shkarkohen të plota: skripti lexon me kërkesa HTTP "range" vetëm pjesët e COG-eve UTM që mbulojnë shtetin. Workflow-i mujor kontrollon nëse Esri ka publikuar një vit të ri dhe, nëse po, e rillogarit vetë.

**Aktivizimi herën e parë:** *Actions → Build land cover → Run workflow* (kodi `XKX`, ose bosh për të gjitha paketat).

## Përshtatshmëria e tokës bujqësore (klasat I–VIII)

Për Kosovën, skeda **Qëndrueshmëria** tregon edhe ku janë ndërtuar zonat e reja sipas klasës së përshtatshmërisë së tokës bujqësore (I = më e përshtatshmja, VIII = më pak). Burimi është rasteri 50 m `data-src/als-xkx.tif` (EPSG:9141), i dhënë nga autori; vlerat jashtë kufirit të Kosovës maskohen.

Për çdo piksel të ndërtuar të WSF Evolution dhe të WSF Tracker merret klasa e tokës në qendrën e tij. Rezultati jepet për çdo hap kohor, për Kosovën dhe për çdo komunë e zonë kadastrale (`dist/data/XKX/soil.json`), dhe ndjek filtrin dhe periudhën e zgjedhur. Tabela tregon sipërfaqen e çdo klase, sa është ndërtuar, sa % e klasës është zënë dhe sa është shtuar në periudhë.

Llogaritja: `python scripts/prepare_soil.py --country XKX`. Për një shtet tjetër me raster të ngjashëm, shtoni `"soil": {"path": …, "epsg": …}` te `scripts/countries.json` (sistemi duhet të jetë te `TM_SYSTEMS` në `scripts/common.py`).

## Analiza sipas komunave dhe zonave kadastrale

Skeda **Njësitë** i llogarit të gjitha treguesit për 38 komunat dhe 1 304 zonat kadastrale, për çdo hap kohor:

- sipërfaqja e ndërtuar, pjesa e territorit të ndërtuar, rritja nga gjendja fillestare, shtesa dhe shtesa për km² territor;
- hartë tematike që ndryshon ngjyrat me kohën, tabelë e renditshme dhe grafik krahasues;
- filtër me dy hapa: **komunat** (një ose disa) dhe, opsionalisht, **zonat kadastrale** brenda tyre, nga lista me kutiza dhe filtër sipas emrit. Për çdo komunë analizohen zonat e zgjedhura, ose e gjithë komuna nëse nuk ka zona. Filtri aktiv shfaqet si etiketa që hiqen me ×, dhe i njëjti filtër shfaqet mbi hartë;
- klikimi në hartë: jashtë komunave të zgjedhura shton komunën, brenda tyre zgjedh ose heq zonën kadastrale;
- kur ka komunë të zgjedhur, harta kryesore vizaton vetëm kufirin e saj; harta tematike e thekson atë, i zbeh të tjerat dhe shfaq emrat e komunave;
- nëse filtri del jashtë pamjes, harta e tregon dhe ofron *Shko te filtri* ose *Hiq filtrin*;
- përzgjedhje e shumëfishtë nga harta kryesore, nga harta tematike ose nga tabela, me përmbledhje të përbashkët dhe kalim nga komuna te zonat e saj;
- **filtri hapësinor**: kur zgjidhen zona kadastrale (ose vetëm komuna), harta zmadhohet dhe qendërzohet te to, pjesa tjetër zbehet, dhe shifrat në të majtë, grafikët e skedës *Kjo zonë* dhe diagrami radial llogariten vetëm brenda tyre. Kur diagrami radial është i ndezur, rrethi i tij është gjithmonë kufi: shfaqet dhe llogaritet vetëm pjesa brenda rrethit (dhe brenda njësive të zgjedhura, nëse ka). Jashtë kufirit vizatohet vetëm ndërtimi i vitit bazë, me ngjyrën e tij të zakonshme, për orientim. Me diagramin të fikur, kufi është vetëm përzgjedhja, ose e gjithë pamja. Shiriti *Filtri ✕* mbi hartë e heq filtrin;
- eksport CSV me të gjitha vitet;
- **ruajtja e pamjes** (kutia *Shkarko hartën e kësaj zone* në panelin e majtë) si **PNG** (2× rezolucion) ose **SVG** (legjenda, teksti dhe diagrami radial si vektor, harta si imazh): përfshin titullin, vitin, legjendën e viteve, përmbledhjen në ha dhe %, statistikat përshkruese të shtesave dhe rritjes vjetore (mesatarja, mediana, modusi, devijimi standard, Q1, Q3, min, maks), grafikun interpretues *Si u rrit zona e ndërtuar*: dy panele me të njëjtat vite (sipërfaqja gjithsej, me shtesën e vitit si majë me ngjyrën e vitit; dhe shtesa e çdo viti me shkallën e vet), vlerat në ha mbi çdo shtyllë, vitet vertikalisht, vijat e mesatares dhe medianës, kulmi i shënuar, ngjarjet 1999 dhe 2008, brezat e dekadave me vija të lehta të pjerrëta dhe ndryshimi brenda çdo dekade (ha dhe %), dhe një përmbledhje me fjalë (sa herë u rrit, kulmi, ritmi para dhe pas 1999), shtesat sipas drejtimit, shkallën, autorin dhe burimet;
- skeda *Kjo zonë* tregon të njëjtat statistika përshkruese dhe tabelën për çdo vit (ndërtuar në ha, % e zonës, shtesa në ha, rritja në %);
- harta tematike me gradient të verdhë → të kuq (vlera të ulëta të verdha, të larta të kuqe).
- adresa e faqes ruan nivelin dhe përzgjedhjen, që pamja të ndahet me të tjerët.

Kufijtë burimorë janë në `data-src/` (GeoJSON i ngjeshur, EPSG:9141 KOSOVAREF01 / Balkans zone 7). Zona kadastrale i caktohet komunës në të cilën bie pjesa më e madhe e saj, jo sipas emrit në tabelë.

## Përditësimi automatik

Workflow-i `.github/workflows/update-data.yml` niset më 5 të çdo muaji (ose me dorë nga skeda *Actions*). Për çdo paketë shteti, ai lexon legjendën e WSF Tracker te DLR; nëse ka një hap të ri gjashtëmujor, shkarkon përsëri të dhënat, rillogarit statistikat, ruan ndryshimet dhe e ripublikon faqen. Aplikacioni nuk ka asnjë vit të shkruar në kod: hapat kohorë, emërtimet dhe legjenda vijnë nga `dist/data/<ISO3>/manifest.json`.

Rregulli i kohës: gjendja fillestare e korrikut 2016, pastaj gjendja e çdo janari. Kur DLR publikon një gjendje korriku, ajo shfaqet si hap i fundit derisa të dalë janari pasues.

Për ta nisur me dorë: *Actions → Update WSF data → Run workflow*. Opsioni *force* i rillogarit statistikat edhe pa të dhëna të reja, p.sh. pasi të ndryshoni kufijtë në `data-src/`.

## Rendi i skripteve

```sh
pip install -r requirements.txt
python scripts/test_pipeline.py                        # test offline me një shtet sintetik
python scripts/prepare_data.py --country ALB           # pllakat WSF, vendbanimet, kufiri
python scripts/prepare_boundaries.py --country ALB     # njësitë e dy niveleve
python scripts/prepare_population.py --country ALB     # GHS-POP (+ regjistrimi, nëse ka)
python scripts/compute_stats.py --country ALB          # statistikat
python scripts/prepare_landcover.py --country ALB      # mbulesa e tokës (Esri 10m Land Cover, seri vjetore)
python scripts/prepare_soil.py --country XKX           # përshtatshmëria e tokës bujqësore (vetëm ku ka raster)
python scripts/list_countries.py                       # dist/data/countries.json
```

Pa `--country`, skriptet punojnë për Kosovën (`XKX`).

## Publikimi në GitHub Pages

Ngarkoni përmbajtjen e këtij projekti në një repository, p.sh.:

```sh
git init
git add .
git commit -m "Atlasi urban i Kosovës"
git branch -M main
git remote add origin https://github.com/<përdoruesi>/kosova-urban.git
git push -u origin main
```
 Në **Settings → Pages → Build and deployment**, zgjidhni **GitHub Actions**. Workflow i përfshirë publikon dosjen `dist` pas çdo push në degën `main`.

Hapat ndjekin [udhëzimin zyrtar të GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Të dhënat dhe kufizimet

**WSF Evolution** përdor kodet e viteve 1985–2015 me rezolucion burimor rreth 30 m. Viti 1985 përfshin gjendjen e identifikuar deri në vitin e parë të serisë.

**WSF Tracker** përdor 20 kategori gjashtëmujore, nga korriku 2016 deri në janar 2026. Aplikacioni i grupon në gjendjen bazë të korrikut 2016 dhe gjendjet e janarit 2017–2026. Shifra e shtesës së 2017-s mbulon gjashtë muaj. Shifrat e mëvonshme mbulojnë një vit.

Të dy produktet shfaqen veçmas. Ngjyra pasqyron kohën e identifikimit të zonës së ndërtuar në produktin satelitor. Të dhënat mund të përmbajnë gabime klasifikimi dhe boshllëqe.

Tracker është marrë nga shërbimi WMS i DLR në 16 pllaka prej 4096 × 4096 pikselësh, në EPSG:4326. Hapi i kërkuar për territorin është afërsisht 9,5–10,3 m në veri–jug dhe 9,4–9,6 m në lindje–perëndim. Evolution është marrë nga GeoTIFF-et e burimit dhe është kampionuar në 16 pllaka prej 1536 × 1536 pikselësh. Në pamje të gjera, aplikacioni kampionon pllakat për ekranin me metodën e fqinjit më të afërt.

Sipërfaqet janë vlerësime nga pikselët e pamjes së ekranit, me një përafrim lokal të distancave gjeografike dhe me maskën e kufirit të Kosovës. Ndryshimi i madhësisë së ekranit ose i zmadhimit mund të ndryshojë pak vlerat. Për analiza statistikore duhen rasterët burimorë dhe një projeksion i përshtatshëm për matjen e sipërfaqeve.

Konturi i vendit është thjeshtuar për paraqitjen në ekran. Katalogu vjen nga GeoNames. Emrat e 38 qendrave dhe përmasat fillestare të hartave janë në `scripts/municipal-windows.json`. Pamja e Novobërdës është qendruar te Bostani. Koordinata e Dragashit është korrigjuar sipas qytetit në OpenStreetMap.

## Ripërgatitja e të dhënave

Të dhënat e shpërndara në `dist/data/<ISO3>` mjaftojnë për përdorimin normal. Për të marrë sërish burimet publike dhe për të krijuar pllakat:

```sh
python -m pip install -r requirements.txt
python scripts/prepare_data.py --country XKX
```

Pastaj llogaritni statistikat e panelit të analizës (`dist/data/XKX/stats.json`):

```sh
python scripts/compute_stats.py --country XKX
```

Shkarkimet ruhen në `.cache/<ISO3>`. Pllakat ekzistuese ripërdoren. Për t'i rikrijuar, zhvendosni pllakat përkatëse jashtë `dist/data` para ekzekutimit. Disponueshmëria e shërbimeve publike mund të ndryshojë.

## Burimet dhe licencat

- [DLR World Settlement Footprint](https://geoservice.dlr.de/web/datasets/wsf), CC BY 4.0. Rasterët janë kampionuar dhe koduar në PNG për shfletuesin.
- [Agjencia e Statistikave të Kosovës](https://ask.rks-gov.net/), regjistrimet e popullsisë 2011 dhe 2024, sipas komunave.
- [GHS-POP R2023A](https://data.jrc.ec.europa.eu/dataset/2ff68a52-5b5b-4a22-8f40-c41da8332cfe), JRC, popullsia e modeluar (rishpërdorim me kreditim).
- [geoBoundaries](https://www.geoboundaries.org/), kufijtë administrativë të shteteve të tjera; licenca e secilit shtet jepet në metadatat e burimit.
- [Esri / Impact Observatory, Sentinel-2 10m Land Use/Land Cover Time Series](https://livingatlas.arcgis.com/landcover/), Karra et al. (2021), CC BY 4.0. Përmban të dhëna të modifikuara Copernicus Sentinel.
- [GeoNames](https://www.geonames.org/), CC BY 4.0. Emrat janë filtruar për vendbanime dhe janë plotësuar me etiketat në shqip të qendrave komunale.
- [OpenStreetMap](https://www.openstreetmap.org/copyright), harta bazë, © kontribuuesit e OpenStreetMap, ODbL.
- [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9), imazh satelitor opsional, © Esri, Maxar, Earthstar Geographics, sipas kushteve të Esri.
- [geoBoundaries](https://www.geoboundaries.org/), kufiri XKX ADM0 me burim OpenStreetMap, sipas metadatave të burimit CC BY-SA 2.0. Konturi në aplikacion është thjeshtuar.

Ruani kreditimin dhe kushtet e licencës së secilit burim gjatë rishpërndarjes.

Kodi i aplikacionit: © 2026 Rizah Murseli. Shtoni një skedar `LICENSE` nëse dëshironi ta lejoni ripërdorimin e kodit (p.sh. MIT).

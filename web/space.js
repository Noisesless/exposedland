/**
 * SIMTARU SPACE — Kecamatan Banjarnegara
 * Singapore URA SPACE (Urban Redevelopment Authority) Inspired Geospatial Portal
 * Master Plan Zoning, Development Control (ITBX), 10.918 Cadastral Buildings & POIs
 */

(function () {
  'use strict';

  // 1. Regulatory Zoning Knowledge Base (Master Plan Development Controls)
  const ZONING_RULES = {
    '32101000': {
      name: 'Kawasan Permukiman Perkotaan',
      category: 'Residential Urban',
      color: '#ea580c',
      kdb: '60% – 70%',
      klb: '2.1 – 2.8',
      kdh: '20% – 30%',
      gsb: '4.0 – 6.0 m',
      allow: 'Hunian rumah tinggal, townhouse, ruko, kantor pelayanan, RTH lingkungan, sarana pendidikan dasar.',
      limit: 'Industri kreatif rumahan, toko swalayan lokal, cafe/resto skala lingkungan.',
      cond: 'Fasilitas kesehatan rawat inap, SPBU perkotaan, menara telekomunikasi mandiri.',
      prohib: 'Industri manufaktur berat polutif, penambangan bahan galian, TPA persampahan.'
    },
    '32102000': {
      name: 'Kawasan Permukiman Perdesaan',
      category: 'Residential Rural',
      color: '#f97316',
      kdb: '50% – 60%',
      klb: '1.2 – 1.8',
      kdh: '30% – 40%',
      gsb: '5.0 – 7.0 m',
      allow: 'Rumah tinggal tunggal, kebun pekarangan, lumbung pangan, sarana peribadatan desa.',
      limit: 'Home industry olahan pangan lokal, peternakan rakyat skala mikro.',
      cond: 'Gudang pupuk/pertanian terpadu, bengkel mesin pertanian.',
      prohib: 'Perumahan skala besar berkepadatan tinggi, industri kimia dan logam.'
    },
    '32041000': {
      name: 'Kawasan Tanaman Pangan (LP2B)',
      category: 'Agriculture (Protected)',
      color: '#84cc16',
      kdb: 'Maks 10% (Sarpras)',
      klb: 'Maks 0.2',
      kdh: 'Min 80%',
      gsb: '10.0 m dari irigasi',
      allow: 'Budidaya padi sawah irigasi teknis, saluran irigasi, jalan usaha tani, saung tani.',
      limit: 'Pabrik penggilingan padi (rice milling unit), lantai jemur gabah.',
      cond: 'Pembangunan jaringan irigasi sekunder/tersier, transmisi ketenagalistrikan.',
      prohib: 'Alih fungsi menjadi perumahan komersial, ruko, industri non-pertanian.'
    },
    '32042000': {
      name: 'Kawasan Hortikultura',
      category: 'Horticulture',
      color: '#65a30d',
      kdb: 'Maks 20%',
      klb: 'Maks 0.4',
      kdh: 'Min 70%',
      gsb: '6.0 m',
      allow: 'Budidaya sayur-mayur, buah-buahan, tanaman hias, pembibitan, green house.',
      limit: 'Agrowisata petik buah terbatas, kios penjualan hasil panen langsung.',
      cond: 'Fasilitas cold storage hasil pertanian, laboratorium kultur jaringan.',
      prohib: 'Kegiatan yang mengubah topografi lereng dan merusak tata air tanah.'
    },
    '32043000': {
      name: 'Kawasan Perkebunan',
      category: 'Plantation',
      color: '#4d7c0f',
      kdb: 'Maks 15%',
      klb: 'Maks 0.3',
      kdh: 'Min 75%',
      gsb: '8.0 m',
      allow: 'Tanaman perkebunan tahunan (kopi, teh, cengkeh, karet), jalan kebun.',
      limit: 'Pusat pengolahan biji kopi primer, pondok kerja kebun.',
      cond: 'Pembangunan fasilitas agrowisata berbasis lanskap perkebunan.',
      prohib: 'Pembukaan lahan dengan cara membakar, permukiman padat.'
    },
    '32022000': {
      name: 'Kawasan Hutan Produksi Terbatas',
      category: 'Production Forest',
      color: '#15803d',
      kdb: 'Maks 5%',
      klb: 'Maks 0.1',
      kdh: 'Min 90%',
      gsb: '15.0 m dari tebangan',
      allow: 'Reboisasi, silvikultur, pemungutan hasil hutan bukan kayu (HHBK), jasa lingkungan.',
      limit: 'Penebangan selektif terbatas berizin, pos jaga kehutanan.',
      cond: 'Ekowisata alam terbatas tanpa mengubah bentang alam alami.',
      prohib: 'Penebangan pohon tanpa izin (illegal logging), perburuan satwa liar.'
    },
    '31010000': {
      name: 'Badan Air (Sungai Serayu)',
      category: 'Waterbody',
      color: '#0284c7',
      kdb: '0% (Non-Building)',
      klb: '0',
      kdh: '100%',
      gsb: 'Sempadan 50m – 100m',
      allow: 'Konservasi aliran air alami, retensi banjir, dermaga perahu tradisional, perikanan tangkap.',
      limit: 'Pintu air irigasi, intake air baku PDAM, bendung kendali banjir.',
      cond: 'Jembatan penyeberangan umum, jalur pipa transmisi lintas sungai.',
      prohib: 'Mendirikan bangunan permanen dalam badan air, membuang limbah B3/domestik.'
    }
  };

  // State
  let map;
  let canvasRenderer;
  const layers = {};
  const dataCache = {};
  let currentBasemap = 'positron';
  const basemapTiles = {};
  let selectedHighlight = null;

  // Measurement State
  let measureMode = null; // 'distance' | 'area' | null
  let measurePoints = [];
  let measureLine = null;
  let measurePolygon = null;
  let measureTooltipMarkers = [];

  // DOM Elements
  const mapContainer = document.getElementById('map-container');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const drawerPanel = document.getElementById('drawer-panel');
  const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
  const btnOpenDrawer = document.getElementById('btn-open-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const btnToggleLegend = document.getElementById('btn-toggle-legend');
  const legendDrawer = document.getElementById('legend-drawer');
  const btnCloseLegend = document.getElementById('btn-close-legend');
  const legendDrawerBody = document.getElementById('legend-drawer-body');
  const btnToggleBasemap = document.getElementById('btn-toggle-basemap');
  const basemapModal = document.getElementById('basemap-modal');
  const btnCloseBasemap = document.getElementById('btn-close-basemap');
  const btnToggleMeasure = document.getElementById('btn-toggle-measure');
  const measureModal = document.getElementById('measure-modal');
  const btnCloseMeasure = document.getElementById('btn-close-measure');
  const btnResetView = document.getElementById('btn-reset-view');

  // Inspector Elements
  const inspectorCard = document.getElementById('inspector-card');
  const btnCloseInspector = document.getElementById('btn-close-inspector');
  const inspBadge = document.getElementById('insp-badge');
  const inspTitle = document.getElementById('insp-title');
  const inspKodkws = document.getElementById('insp-kodkws');
  const inspDesa = document.getElementById('insp-desa');
  const inspArea = document.getElementById('insp-area');
  const inspLp2b = document.getElementById('insp-lp2b');
  const inspKrb = document.getElementById('insp-krb');
  const inspAllow = document.getElementById('insp-allow');
  const inspLimit = document.getElementById('insp-limit');
  const inspCond = document.getElementById('insp-cond');
  const inspProhib = document.getElementById('insp-prohib');
  const inspKdb = document.getElementById('insp-kdb');
  const inspKlb = document.getElementById('insp-klb');
  const inspKdh = document.getElementById('insp-kdh');
  const inspGsb = document.getElementById('insp-gsb');

  // Sliders & Checkboxes
  const chkPolaRuang = document.getElementById('chk-pola-ruang');
  const sliderOpacityPola = document.getElementById('slider-opacity-pola');
  const lblOpacityPola = document.getElementById('lbl-opacity-pola');
  const chkBuildings = document.getElementById('chk-buildings');
  const sliderOpacityBldg = document.getElementById('slider-opacity-bldg');
  const lblOpacityBldg = document.getElementById('lbl-opacity-bldg');
  const chkDesa = document.getElementById('chk-desa');
  const chkTransport = document.getElementById('chk-transport');
  const chkSungai = document.getElementById('chk-sungai');
  const chkPoi = document.getElementById('chk-poi');

  // Desa Focus Banner Elements
  let activeDesaFilter = null;
  const btnResetFocus = document.getElementById('btn-reset-focus');
  const desaFocusBanner = document.getElementById('desa-focus-banner');
  const focusDesaName = document.getElementById('focus-desa-name');
  const focusDesaStats = document.getElementById('focus-desa-stats');

  /* ------------------------------------------------------------------ */
  /* 2. Inisialisasi Peta Leaflet & Peta Dasar                          */
  /* ------------------------------------------------------------------ */

  function initMap() {
    // Pusat Kecamatan Banjarnegara (Alun-Alun & Pusat Pemerintahan)
    const centerBanjar = [-7.39617, 109.69515];

    canvasRenderer = L.canvas({ padding: 0.5, tolerance: 5 });

    map = L.map('map-container', {
      center: centerBanjar,
      zoom: 14,
      minZoom: 12,
      maxZoom: 20,
      zoomControl: true,
      preferCanvas: true
    });

    // Peta Dasar Esri Light Gray Canvas (Singapore URA Minimalist Light Canvas - Bebas Watermark)
    basemapTiles.positron = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri &bull; SIMTARU SPACE Banjarnegara',
      maxZoom: 19
    });

    // Esri High-Resolution World Imagery (Satelit)
    basemapTiles.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri World Imagery &bull; Maxar',
      maxZoom: 19
    });

    // Esri World Street Map (Peta Jalan & Toponimi)
    basemapTiles.osm = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri Street Map',
      maxZoom: 19
    });

    // Esri Dark Gray Canvas (Malam)
    basemapTiles.dark = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri Dark Canvas',
      maxZoom: 19
    });

    basemapTiles.positron.addTo(map);

    // Scale Control URA Style
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    // Click on empty map closes inspector & search
    map.on('click', onMapClick);
  }

  function setBasemap(key) {
    if (currentBasemap === key) return;
    map.removeLayer(basemapTiles[currentBasemap]);
    basemapTiles[key].addTo(map);
    currentBasemap = key;

    document.querySelectorAll('.basemap-option').forEach(el => {
      el.classList.toggle('is-active', el.dataset.basemap === key);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 3. Pemuatan Data Geospasial Kecamatan Banjarnegara                 */
  /* ------------------------------------------------------------------ */

  async function loadData() {
    try {
      const [desaRes, polaRes, transportRes, sungaiRes, bldgRes, poiRes, clippedRes] = await Promise.all([
        fetch('../geojson/per-kecamatan/banjarnegara/batas_desa.geojson'),
        fetch('../geojson/per-kecamatan/banjarnegara/pola_ruang.geojson'),
        fetch('../geojson/per-kecamatan/banjarnegara/transportasi.geojson'),
        fetch('../geojson/per-kecamatan/banjarnegara/sungai.geojson'),
        fetch('data/kecamatan_banjarnegara_buildings.geojson'),
        fetch('data/kecamatan_banjarnegara_poi.json'),
        fetch('data/desa_clipped_layers.json').catch(() => null)
      ]);

      dataCache.desa = await desaRes.json();
      dataCache.pola = await polaRes.json();
      dataCache.transport = await transportRes.json();
      dataCache.sungai = await sungaiRes.json();
      dataCache.buildings = await bldgRes.json();
      dataCache.poi = await poiRes.json();
      if (clippedRes && clippedRes.ok) {
        dataCache.clippedDesa = await clippedRes.json();
      }

      buildLayers();
      populateUI();
    } catch (err) {
      console.error('Gagal memuat data spasial:', err);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4. Konstruksi Layer Spasial (Pola Ruang, Persil, Batas, Jalan)    */
  /* ------------------------------------------------------------------ */

  function getPolaStyle(feat) {
    const kod = feat.properties.KODKWS || '32101000';
    const rule = ZONING_RULES[kod] || ZONING_RULES['32101000'];
    const opacity = parseFloat(sliderOpacityPola.value);
    return {
      fillColor: rule.color,
      fillOpacity: opacity,
      color: rule.color,
      weight: 1.2,
      opacity: 0.85
    };
  }

  function onPolaFeature(feat, layer) {
    layer.on({
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        inspectZoningFeature(feat, layer);
      },
      mouseover: () => {
        if (layer !== selectedHighlight) {
          layer.setStyle({ weight: 2.5, opacity: 1.0 });
        }
      },
      mouseout: () => {
        if (layer !== selectedHighlight) {
          const kod = feat.properties.KODKWS || '32101000';
          const rule = ZONING_RULES[kod] || ZONING_RULES['32101000'];
          layer.setStyle({ weight: 1.2, opacity: 0.85, color: rule.color });
        }
      }
    });
  }

  function getBldgStyle() {
    const opacity = parseFloat(sliderOpacityBldg.value);
    return {
      fillColor: '#f1ece1',
      fillOpacity: opacity,
      color: '#64748b',
      weight: 0.8,
      opacity: 0.9
    };
  }

  function onBldgFeature(feat, layer) {
    layer.on({
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        inspectBuildingFeature(feat, layer);
      },
      mouseover: () => {
        layer.setStyle({ fillColor: '#fef08a', color: '#c8102e', weight: 1.5 });
      },
      mouseout: () => {
        if (layer !== selectedHighlight) {
          layer.setStyle({ fillColor: '#f1ece1', color: '#64748b', weight: 0.8 });
        }
      }
    });
  }

  function getDesaStyle() {
    const isSingle = activeDesaFilter !== null;
    return {
      fill: isSingle,
      fillColor: '#c8102e',
      fillOpacity: isSingle ? 0.04 : 0,
      color: isSingle ? '#c8102e' : '#b45309',
      weight: isSingle ? 3.5 : 2.2,
      dashArray: isSingle ? null : '6, 4',
      opacity: 0.95
    };
  }

  function onDesaFeature(feat, layer) {
    const dName = feat.properties.Nama_Desa_ || 'Desa';
    layer.bindTooltip(dName, {
      permanent: false,
      direction: 'center',
      className: 'desa-tooltip'
    });
    layer.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (activeDesaFilter === dName) {
        filterByDesa(null);
      } else {
        filterByDesa(dName);
      }
    });
  }

  function getTransportStyle(feat) {
    const name = (feat.properties.NAMOBJ || feat.properties.REMARK || '').toLowerCase();
    const isArteri = name.includes('pemuda') || name.includes('dipayuda') || name.includes('panjaitan') || name.includes('sudirman');
    return {
      color: isArteri ? '#e11d48' : '#475569',
      weight: isArteri ? 3.0 : 1.6,
      opacity: 0.85
    };
  }

  function getSungaiStyle() {
    return {
      color: '#0284c7',
      weight: 2.5,
      opacity: 0.9
    };
  }

  function renderPoiMarkers(items) {
    if (!layers.poi) layers.poi = L.layerGroup();
    layers.poi.clearLayers();
    if (!items || items.length === 0) return;

    items.forEach((p) => {
      const iconHtml = `
        <div style="background:#c8102e; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid #fff; cursor:pointer;" title="${p.nama}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m10 15 5-3-5-3v6z"/></svg>
        </div>
      `;
      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'poi-custom-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([p.lat, p.lon], { icon: customIcon });
      marker.poiData = p;
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        inspectPoiFeature(p, marker);
      });
      layers.poi.addLayer(marker);
    });
  }

  function buildLayers() {
    // 1. Pola Ruang (Master Plan Zoning)
    layers.pola = L.geoJSON(dataCache.pola, {
      renderer: canvasRenderer,
      style: getPolaStyle,
      onEachFeature: onPolaFeature
    }).addTo(map);

    // 2. Persil Bangunan (10.918 Cadastral Footprints)
    layers.buildings = L.geoJSON(dataCache.buildings, {
      renderer: canvasRenderer,
      style: getBldgStyle,
      pointToLayer: (feat, latlng) => {
        return L.circleMarker(latlng, {
          radius: 3.5,
          fillColor: '#f1ece1',
          fillOpacity: parseFloat(sliderOpacityBldg.value),
          color: '#64748b',
          weight: 0.8
        });
      },
      onEachFeature: onBldgFeature
    }).addTo(map);

    // 3. Batas Kelurahan / Desa (13 Subzones)
    layers.desa = L.geoJSON(dataCache.desa, {
      style: getDesaStyle,
      onEachFeature: onDesaFeature
    }).addTo(map);

    // 4. Jaringan Jalan & Transportasi
    layers.transport = L.geoJSON(dataCache.transport, {
      style: getTransportStyle
    }).addTo(map);

    // 5. Sungai Serayu & Hidrologi
    layers.sungai = L.geoJSON(dataCache.sungai, {
      style: getSungaiStyle
    }).addTo(map);

    // 6. Fasilitas Publik & POI (12 Titik)
    renderPoiMarkers(dataCache.poi);
    layers.poi.addTo(map);
  }

  /* ------------------------------------------------------------------ */
  /* 5. Inpeksi Fitur (Property Inspector URA Style)                    */
  /* ------------------------------------------------------------------ */

  function clearHighlight() {
    if (selectedHighlight) {
      if (selectedHighlight.defaultStyle) {
        selectedHighlight.setStyle(selectedHighlight.defaultStyle);
      }
      selectedHighlight = null;
    }
  }

  function setHighlight(layer) {
    clearHighlight();
    selectedHighlight = layer;
    if (layer && layer.setStyle) {
      layer.defaultStyle = {
        weight: layer.options.weight,
        color: layer.options.color,
        fillColor: layer.options.fillColor,
        fillOpacity: layer.options.fillOpacity
      };
      layer.setStyle({
        weight: 3.5,
        color: '#c8102e',
        fillOpacity: Math.min((layer.options.fillOpacity || 0.6) + 0.25, 0.95)
      });
      if (layer.bringToFront) layer.bringToFront();
    }
  }

  function inspectZoningFeature(feat, layer) {
    setHighlight(layer);
    const props = feat.properties;
    const kod = props.KODKWS || '32101000';
    const rule = ZONING_RULES[kod] || ZONING_RULES['32101000'];

    inspBadge.textContent = rule.category;
    inspBadge.style.backgroundColor = rule.color;
    inspTitle.textContent = props.NAMOBJ || rule.name;
    inspKodkws.textContent = kod;
    inspDesa.textContent = props.WADMKC ? `Kec. Banjarnegara (${props.kecamatan || 'Pusat Kota'})` : 'Kecamatan Banjarnegara';
    const ha = props.luas_ha_geo ? props.luas_ha_geo.toFixed(2) : (props.LUASHA ? props.LUASHA.toFixed(2) : '-');
    const m2 = props.luas_ha_geo ? Math.round(props.luas_ha_geo * 10000).toLocaleString('id-ID') : '-';
    inspArea.textContent = `${ha} ha (${m2} m²)`;
    inspLp2b.textContent = props.KP2B_2 === 'Ada' ? 'Lahan Pertanian Pangan Berkelanjutan (Dilindungi)' : 'Bukan Kawasan LP2B';
    inspKrb.textContent = props.KRB_03 === 'Ada' ? 'Potensi Sempadan Serayu / Genangan Banjir' : 'Aman dari Rawan Bencana';

    // Development Controls
    inspAllow.textContent = rule.allow;
    inspLimit.textContent = rule.limit;
    inspCond.textContent = rule.cond;
    inspProhib.textContent = rule.prohib;

    // Metrics
    inspKdb.textContent = rule.kdb;
    inspKlb.textContent = rule.klb;
    inspKdh.textContent = rule.kdh;
    inspGsb.textContent = rule.gsb;

    inspectorCard.classList.add('is-visible');
  }

  function inspectBuildingFeature(feat, layer) {
    setHighlight(layer);
    const props = feat.properties;

    inspBadge.textContent = 'Persil Bangunan (Kadaster)';
    inspBadge.style.backgroundColor = '#475569';
    inspTitle.textContent = props.name || 'Persil Bangunan';
    inspKodkws.textContent = `OSM ID: ${props.id || '-'}`;
    inspDesa.textContent = props.desa || 'Kecamatan Banjarnegara';
    inspArea.textContent = `${props.area_m2} m² (${(props.area_m2 / 10000).toFixed(4)} ha)`;
    inspLp2b.textContent = 'Sesuai IMB / PBG';
    inspKrb.textContent = 'Zona Terbangun';

    inspAllow.textContent = 'Pemanfaatan bangunan gedung sesuai dengan izin fungsi (Hunian, Komersial, atau Fasilitas).';
    inspLimit.textContent = 'Penambahan lantai wajib mematuhi batas KLB dan daya dukung tanah setempat.';
    inspCond.textContent = 'Perubahan fungsi ke komersial wajib menyediakan ruang parkir mandiri.';
    inspProhib.textContent = 'Melanggar Garis Sempadan Bangunan (GSB) atau menutup saluran drainase kota.';

    inspKdb.textContent = `Estimasi Lantai: ${props.est_floors} Lantai`;
    inspKlb.textContent = `Tipe: ${props.type}`;
    inspKdh.textContent = 'Min 20%';
    inspGsb.textContent = '4.0 m';

    inspectorCard.classList.add('is-visible');
  }

  function inspectDesaFeature(feat, layer) {
    setHighlight(layer);
    const props = feat.properties;
    const dName = props.Nama_Desa_ || 'Kelurahan';

    inspBadge.textContent = 'Wilayah Perencanaan Sub-Zona';
    inspBadge.style.backgroundColor = '#b45309';
    inspTitle.textContent = dName;
    inspKodkws.textContent = `Kode Administrasi: ${props.OBJECTID || '-'}`;
    inspDesa.textContent = 'Kecamatan Banjarnegara, Kab. Banjarnegara';
    const ha = props.luas_ha_geo ? props.luas_ha_geo.toFixed(2) : '-';
    inspArea.textContent = `${ha} ha`;
    inspLp2b.textContent = 'Tersedia Lahan Hijau & Pemukiman';
    inspKrb.textContent = 'Sesuai Peta KRB BPBD';

    inspAllow.textContent = `Pembangunan infrastruktur kelurahan, permukiman warga, pusat pelayanan ${dName}.`;
    inspLimit.textContent = 'Pemanfaatan lahan di lereng perbukitan selatan wajib berterasering.';
    inspCond.textContent = 'Izin pembukaan perumahan baru di atas 1 hektar wajib persetujuan RTRW.';
    inspProhib.textContent = 'Pembangunan tanpa izin tata ruang atau merusak sempadan sungai.';

    inspKdb.textContent = 'Standar RDTR';
    inspKlb.textContent = 'Maks 3 Lantai';
    inspKdh.textContent = 'Min 30%';
    inspGsb.textContent = 'Standar PU';

    inspectorCard.classList.add('is-visible');
  }

  function inspectPoiFeature(poi, marker) {
    inspBadge.textContent = poi.kategori;
    inspBadge.style.backgroundColor = '#c8102e';
    inspTitle.textContent = poi.nama;
    inspKodkws.textContent = poi.id;
    inspDesa.textContent = `${poi.desa}, Kec. Banjarnegara`;
    inspArea.textContent = `Koordinat: ${poi.lat.toFixed(5)}, ${poi.lon.toFixed(5)}`;
    inspLp2b.textContent = 'Fasilitas Umum Pemda';
    inspKrb.textContent = 'Aman & Terawat';

    inspAllow.textContent = poi.keterangan;
    inspLimit.textContent = 'Pemanfaatan publik sesuai jadwal dan ketentuan pengelola kawasan.';
    inspCond.textContent = 'Penyelenggaraan acara umum / komersial membutuhkan rekomendasi izin kepolisian & dinas terkait.';
    inspProhib.textContent = 'Mengubah bentuk bangunan cagar budaya atau merusak fasilitas taman kota.';

    inspKdb.textContent = 'Fasilitas Publik';
    inspKlb.textContent = 'Sesuai Fungsi';
    inspKdh.textContent = 'Taman Terbuka';
    inspGsb.textContent = 'Akses Utama';

    inspectorCard.classList.add('is-visible');
    map.setView([poi.lat, poi.lon], 16, { animate: true });
  }

  function onMapClick() {
    clearHighlight();
    inspectorCard.classList.remove('is-visible');
    searchResults.classList.remove('is-open');
    if (measureMode) {
      // Measurement click handled separately
    }
  }

  /* ------------------------------------------------------------------ */
  /* 6. Populate UI Controls (Zone List, Desa Chips, Legend, POIs)      */
  /* ------------------------------------------------------------------ */

  function populateUI() {
    // 1. Zone items in Sidebar
    const zoneList = document.getElementById('zone-list');
    const legendList = document.getElementById('legend-drawer-body');
    zoneList.innerHTML = '';
    legendList.innerHTML = '';

    // Calculate areas per zone
    const zoneAreas = {};
    dataCache.pola.features.forEach((feat) => {
      const kod = feat.properties.KODKWS || '32101000';
      const a = feat.properties.luas_ha_geo || 0;
      zoneAreas[kod] = (zoneAreas[kod] || 0) + a;
    });

    Object.keys(ZONING_RULES).forEach((kod) => {
      const rule = ZONING_RULES[kod];
      const area = (zoneAreas[kod] || 0).toFixed(1);

      // Sidebar Row
      const row = document.createElement('div');
      row.className = 'zone-row';
      row.innerHTML = `
        <span class="zone-color-swatch" style="background:${rule.color}"></span>
        <span class="zone-label-wrap">
          <span>${rule.name}</span>
        </span>
        <span class="zone-area-tag">${area} ha</span>
      `;
      row.addEventListener('click', () => {
        highlightZoningType(kod);
      });
      zoneList.appendChild(row);

      // Legend Row
      const lRow = document.createElement('div');
      lRow.className = 'zone-row';
      lRow.innerHTML = `
        <span class="zone-color-swatch" style="background:${rule.color}"></span>
        <span class="zone-label-wrap">
          <span style="font-weight:600">${rule.name}</span>
          <span style="font-size:10px; color:var(--ura-muted)">${rule.category}</span>
        </span>
      `;
      legendList.appendChild(lRow);
    });

    // 2. Desa Quick Chips in Sidebar
    const desaContainer = document.getElementById('desa-chips-container');
    desaContainer.innerHTML = '';

    // Tombol Reset / Tampilkan Seluruh Kecamatan
    const btnResetChip = document.createElement('div');
    btnResetChip.id = 'btn-desa-reset-chip';
    btnResetChip.className = 'desa-chip-reset is-active';
    btnResetChip.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <span>Tampilkan Seluruh Kecamatan (13 Kelurahan)</span>
    `;
    btnResetChip.addEventListener('click', () => {
      filterByDesa(null);
    });
    desaContainer.appendChild(btnResetChip);

    dataCache.desa.features.forEach((feat) => {
      const dName = feat.properties.Nama_Desa_ || 'Kelurahan';
      const ha = (feat.properties.luas_ha_geo || 0).toFixed(0);
      const chip = document.createElement('div');
      chip.className = 'desa-chip';
      chip.dataset.desa = dName;
      chip.innerHTML = `
        <strong>${dName}</strong>
        <span class="chip-sub">${ha} hektar</span>
      `;
      chip.addEventListener('click', () => {
        if (activeDesaFilter === dName) {
          filterByDesa(null);
        } else {
          filterByDesa(dName);
        }
      });
      desaContainer.appendChild(chip);
    });

    // Pasang listener pada Floating Focus Banner
    if (btnResetFocus) {
      btnResetFocus.addEventListener('click', () => {
        filterByDesa(null);
      });
    }

    // 3. POI List in Sidebar
    const poiContainer = document.getElementById('poi-list-container');
    poiContainer.innerHTML = '';
    dataCache.poi.forEach((p) => {
      const pRow = document.createElement('div');
      pRow.className = 'zone-row';
      pRow.style.cursor = 'pointer';
      pRow.innerHTML = `
        <span class="zone-color-swatch" style="background:#c8102e; border-radius:50%"></span>
        <span class="zone-label-wrap">
          <strong style="color:var(--ura-navy)">${p.nama}</strong>
          <span style="font-size:10px; color:var(--ura-muted)">${p.desa}</span>
        </span>
      `;
      pRow.addEventListener('click', () => {
        inspectPoiFeature(p);
      });
      poiContainer.appendChild(pRow);
    });
  }

  function highlightZoningType(kod) {
    if (!layers.pola) return;
    layers.pola.eachLayer((l) => {
      const featKod = l.feature.properties.KODKWS || '32101000';
      if (featKod === kod) {
        l.setStyle({ weight: 2.8, color: '#c8102e', fillOpacity: 0.85 });
      } else {
        l.setStyle({ weight: 0.5, color: '#e2e8f0', fillOpacity: 0.2 });
      }
    });
    setTimeout(() => {
      layers.pola.resetStyle();
    }, 4500);
  }

  function filterByDesa(desaName) {
    clearHighlight();

    if (!desaName) {
      // 1. Reset filter -> Tampilkan seluruh 13 kelurahan/desa (Satu Kecamatan Penuh)
      activeDesaFilter = null;

      if (layers.pola && dataCache.pola) {
        layers.pola.clearLayers();
        layers.pola.addData(dataCache.pola);
      }

      if (layers.buildings && dataCache.buildings) {
        layers.buildings.clearLayers();
        layers.buildings.addData(dataCache.buildings);
      }

      if (layers.transport && dataCache.transport) {
        layers.transport.clearLayers();
        layers.transport.addData(dataCache.transport);
      }

      if (layers.sungai && dataCache.sungai) {
        layers.sungai.clearLayers();
        layers.sungai.addData(dataCache.sungai);
      }

      if (layers.desa && dataCache.desa) {
        layers.desa.clearLayers();
        layers.desa.addData(dataCache.desa);
      }

      if (dataCache.poi) {
        renderPoiMarkers(dataCache.poi);
      }

      // Reset state tombol & chip
      document.querySelectorAll('.desa-chip').forEach(el => el.classList.remove('is-active'));
      const btnResetChip = document.getElementById('btn-desa-reset-chip');
      if (btnResetChip) btnResetChip.classList.add('is-active');

      if (desaFocusBanner) desaFocusBanner.classList.remove('is-active');
      if (inspectorCard) inspectorCard.classList.remove('is-visible');

      if (layers.desa && layers.desa.getBounds().isValid()) {
        map.fitBounds(layers.desa.getBounds(), { padding: [40, 40] });
      }
      return;
    }

    // 2. Terapkan isolasi spasial murni 1 kelurahan/desa (Spatial Dataset Replacement)
    activeDesaFilter = desaName;
    const desaFeat = dataCache.desa.features.find(f => f.properties.Nama_Desa_ === desaName);
    if (!desaFeat) return;

    // Ambil kumpulan layer yang telah dipotong khusus batas desa ini
    const clipped = dataCache.clippedDesa && dataCache.clippedDesa[desaName];

    if (clipped) {
      // Ganti isi seluruh layer Leaflet hanya dengan objek di dalam batas desa
      if (layers.pola) {
        layers.pola.clearLayers();
        if (clipped.pola) layers.pola.addData(clipped.pola);
      }

      if (layers.buildings) {
        layers.buildings.clearLayers();
        if (clipped.buildings) layers.buildings.addData(clipped.buildings);
      }

      if (layers.transport) {
        layers.transport.clearLayers();
        if (clipped.transport) layers.transport.addData(clipped.transport);
      }

      if (layers.sungai) {
        layers.sungai.clearLayers();
        if (clipped.sungai) layers.sungai.addData(clipped.sungai);
      }

      if (layers.desa) {
        layers.desa.clearLayers();
        if (clipped.boundary) layers.desa.addData(clipped.boundary);
      }

      renderPoiMarkers(clipped.poi || []);
    }

    // Update UI Chips & Active State
    document.querySelectorAll('.desa-chip').forEach(el => {
      const isThis = el.dataset.desa === desaName;
      el.classList.toggle('is-active', isThis);
    });
    const btnResetChip = document.getElementById('btn-desa-reset-chip');
    if (btnResetChip) btnResetChip.classList.remove('is-active');

    // Update Floating Focus Banner
    if (desaFocusBanner && focusDesaName && focusDesaStats) {
      focusDesaName.textContent = desaName;
      const bldgCount = clipped && clipped.buildings ? clipped.buildings.features.length : 0;
      const zoneCount = clipped && clipped.pola ? clipped.pola.features.length : 0;
      focusDesaStats.textContent = `${bldgCount.toLocaleString()} Persil \u2022 ${zoneCount} Zona`;
      desaFocusBanner.classList.add('is-active');
    }

    // Zoom tepat ke batas desa
    const bounds = L.geoJSON(desaFeat).getBounds();
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });

    const dLayer = layers.desa && layers.desa.getLayers ? layers.desa.getLayers()[0] : null;
    inspectDesaFeature(desaFeat, dLayer);
  }

  function zoomToDesa(feat) {
    const dName = feat.properties.Nama_Desa_;
    filterByDesa(dName);
  }

  /* ------------------------------------------------------------------ */
  /* 7. Autocomplete Search Bar                                         */
  /* ------------------------------------------------------------------ */

  function setupSearch() {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (q.length < 2) {
        searchResults.innerHTML = '';
        searchResults.classList.remove('is-open');
        return;
      }
      renderSearchResults(q);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= 2) {
        searchResults.classList.add('is-open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === 'Escape') {
        searchResults.classList.remove('is-open');
        inspectorCard.classList.remove('is-visible');
        basemapModal.classList.remove('is-visible');
        measureModal.classList.remove('is-visible');
      }
    });
  }

  function renderSearchResults(query) {
    searchResults.innerHTML = '';
    const results = [];

    // Search POIs
    if (dataCache.poi) {
      dataCache.poi.forEach((p) => {
        if (p.nama.toLowerCase().includes(query) || p.desa.toLowerCase().includes(query)) {
          results.push({
            type: 'poi',
            title: p.nama,
            sub: `${p.kategori} &bull; ${p.desa}`,
            badge: 'Fasilitas',
            data: p
          });
        }
      });
    }

    // Search Kelurahan / Desa
    if (dataCache.desa) {
      dataCache.desa.features.forEach((feat) => {
        const dName = feat.properties.Nama_Desa_ || '';
        if (dName.toLowerCase().includes(query)) {
          results.push({
            type: 'desa',
            title: dName,
            sub: `Kecamatan Banjarnegara (${(feat.properties.luas_ha_geo || 0).toFixed(1)} ha)`,
            badge: 'Kelurahan',
            data: feat
          });
        }
      });
    }

    // Search Roads
    if (dataCache.transport) {
      dataCache.transport.features.forEach((feat) => {
        const rName = feat.properties.NAMOBJ || '';
        if (rName.toLowerCase().includes(query)) {
          results.push({
            type: 'road',
            title: rName,
            sub: 'Jaringan Jalan Kota',
            badge: 'Jalan',
            data: feat
          });
        }
      });
    }

    // Search Buildings (sample up to 5)
    if (dataCache.buildings) {
      let bCount = 0;
      dataCache.buildings.features.forEach((feat) => {
        if (bCount >= 5) return;
        const bName = (feat.properties.name || '').toLowerCase();
        const bId = String(feat.properties.id || '');
        if ((bName && bName.includes(query)) || bId.includes(query)) {
          results.push({
            type: 'bldg',
            title: feat.properties.name || `Persil #${bId}`,
            sub: `${feat.properties.desa} &bull; ${feat.properties.area_m2} m²`,
            badge: 'Persil',
            data: feat
          });
          bCount++;
        }
      });
    }

    if (results.length === 0) {
      searchResults.innerHTML = '<div style="padding:12px; color:var(--ura-muted); text-align:center;">Tidak ada hasil ditemukan</div>';
      searchResults.classList.add('is-open');
      return;
    }

    results.slice(0, 15).forEach((item) => {
      const el = document.createElement('div');
      el.className = 'search-item';
      el.innerHTML = `
        <div class="search-item__main">
          <span class="search-item__name">${item.title}</span>
          <span class="search-item__sub">${item.sub}</span>
        </div>
        <span class="search-item__badge">${item.badge}</span>
      `;
      el.addEventListener('click', () => {
        onSelectSearchResult(item);
      });
      searchResults.appendChild(el);
    });

    searchResults.classList.add('is-open');
  }

  function onSelectSearchResult(item) {
    searchResults.classList.remove('is-open');
    if (item.type === 'poi') {
      inspectPoiFeature(item.data);
    } else if (item.type === 'desa') {
      zoomToDesa(item.data);
    } else if (item.type === 'road' || item.type === 'bldg') {
      const gLayer = L.geoJSON(item.data);
      map.fitBounds(gLayer.getBounds(), { maxZoom: 18, padding: [40, 40] });
      if (item.type === 'bldg') {
        inspectBuildingFeature(item.data, gLayer.getLayers()[0]);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 8. Alat Pengukuran Spasial (Measurement Tool URA Style)           */
  /* ------------------------------------------------------------------ */

  function setupMeasurement() {
    const btnMeasureDist = document.getElementById('btn-measure-dist');
    const btnMeasureArea = document.getElementById('btn-measure-area');
    const btnMeasureClear = document.getElementById('btn-measure-clear');
    const measureInstruction = document.getElementById('measure-instruction');
    const measureResult = document.getElementById('measure-result');

    btnMeasureDist.addEventListener('click', () => {
      measureMode = 'distance';
      btnMeasureDist.classList.add('is-active');
      btnMeasureArea.classList.remove('is-active');
      measureInstruction.textContent = 'Klik titik di peta untuk mengukur jarak lintasan jalan. Dobel-klik untuk selesai.';
      clearMeasurement();
    });

    btnMeasureArea.addEventListener('click', () => {
      measureMode = 'area';
      btnMeasureArea.classList.add('is-active');
      btnMeasureDist.classList.remove('is-active');
      measureInstruction.textContent = 'Klik titik sudut di peta untuk membentuk poligon luas kavling/lahan. Dobel-klik untuk selesai.';
      clearMeasurement();
    });

    btnMeasureClear.addEventListener('click', () => {
      clearMeasurement();
      measureResult.textContent = 'Hasil: 0 meter';
    });

    map.on('click', (e) => {
      if (!measureMode) return;
      measurePoints.push(e.latlng);

      const m = L.circleMarker(e.latlng, {
        radius: 4,
        color: '#c8102e',
        fillColor: '#fff',
        fillOpacity: 1
      }).addTo(map);
      measureTooltipMarkers.push(m);

      if (measureMode === 'distance') {
        if (!measureLine) {
          measureLine = L.polyline(measurePoints, { color: '#c8102e', weight: 3, dashArray: '4,4' }).addTo(map);
        } else {
          measureLine.setLatLngs(measurePoints);
        }

        let totalDist = 0;
        for (let i = 0; i < measurePoints.length - 1; i++) {
          totalDist += measurePoints[i].distanceTo(measurePoints[i + 1]);
        }

        const dStr = totalDist > 1000 ? `${(totalDist / 1000).toFixed(2)} km` : `${Math.round(totalDist)} meter`;
        measureResult.textContent = `Total Jarak: ${dStr}`;
      } else if (measureMode === 'area') {
        if (!measurePolygon) {
          measurePolygon = L.polygon(measurePoints, { color: '#c8102e', fillColor: '#c8102e', fillOpacity: 0.25 }).addTo(map);
        } else {
          measurePolygon.setLatLngs(measurePoints);
        }

        if (measurePoints.length >= 3) {
          const areaM2 = calculatePolygonArea(measurePoints);
          const ha = (areaM2 / 10000).toFixed(2);
          measureResult.textContent = `Total Luas: ${Math.round(areaM2).toLocaleString('id-ID')} m² (${ha} ha)`;
        }
      }
    });
  }

  function calculatePolygonArea(latlngs) {
    let area = 0;
    const n = latlngs.length;
    if (n < 3) return 0;
    const cosLat = Math.cos(latlngs[0].lat * Math.PI / 180);
    for (let i = 0; i < n; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[(i + 1) % n];
      const x1 = p1.lng * 111319.5 * cosLat;
      const y1 = p1.lat * 111319.5;
      const x2 = p2.lng * 111319.5 * cosLat;
      const y2 = p2.lat * 111319.5;
      area += (x1 * y2) - (x2 * y1);
    }
    return Math.abs(area) / 2;
  }

  function clearMeasurement() {
    measurePoints = [];
    if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    if (measurePolygon) { map.removeLayer(measurePolygon); measurePolygon = null; }
    measureTooltipMarkers.forEach(m => map.removeLayer(m));
    measureTooltipMarkers = [];
  }

  /* ------------------------------------------------------------------ */
  /* 9. Event Listeners & UI Controls                                  */
  /* ------------------------------------------------------------------ */

  function setupUIEvents() {
    // Drawer panel toggling
    btnToggleDrawer.addEventListener('click', () => {
      const isCollapsed = drawerPanel.classList.toggle('is-collapsed');
      btnToggleDrawer.classList.toggle('is-active', !isCollapsed);
      btnOpenDrawer.classList.toggle('is-visible', isCollapsed);
    });

    btnOpenDrawer.addEventListener('click', () => {
      drawerPanel.classList.remove('is-collapsed');
      btnToggleDrawer.classList.add('is-active');
      btnOpenDrawer.classList.remove('is-visible');
    });

    btnCloseDrawer.addEventListener('click', () => {
      drawerPanel.classList.add('is-collapsed');
      btnToggleDrawer.classList.remove('is-active');
      btnOpenDrawer.classList.add('is-visible');
    });

    // Legend Drawer
    btnToggleLegend.addEventListener('click', () => {
      const isOpen = legendDrawer.classList.toggle('is-visible');
      btnToggleLegend.classList.toggle('is-active', isOpen);
    });

    btnCloseLegend.addEventListener('click', () => {
      legendDrawer.classList.remove('is-visible');
      btnToggleLegend.classList.remove('is-active');
    });

    // Basemap Flyout
    btnToggleBasemap.addEventListener('click', () => {
      const isOpen = basemapModal.classList.toggle('is-visible');
      btnToggleBasemap.classList.toggle('is-active', isOpen);
      if (isOpen) measureModal.classList.remove('is-visible');
    });

    btnCloseBasemap.addEventListener('click', () => {
      basemapModal.classList.remove('is-visible');
      btnToggleBasemap.classList.remove('is-active');
    });

    document.querySelectorAll('.basemap-option').forEach(el => {
      el.addEventListener('click', () => {
        setBasemap(el.dataset.basemap);
        basemapModal.classList.remove('is-visible');
        btnToggleBasemap.classList.remove('is-active');
      });
    });

    // Measurement Flyout
    btnToggleMeasure.addEventListener('click', () => {
      const isOpen = measureModal.classList.toggle('is-visible');
      btnToggleMeasure.classList.toggle('is-active', isOpen);
      if (isOpen) {
        basemapModal.classList.remove('is-visible');
        measureMode = 'distance';
      } else {
        measureMode = null;
        clearMeasurement();
      }
    });

    btnCloseMeasure.addEventListener('click', () => {
      measureModal.classList.remove('is-visible');
      btnToggleMeasure.classList.remove('is-active');
      measureMode = null;
      clearMeasurement();
    });

    // Reset View Button
    btnResetView.addEventListener('click', () => {
      map.setView([-7.39768, 109.69715], 14, { animate: true });
    });

    // Inspector Close Button
    btnCloseInspector.addEventListener('click', () => {
      clearHighlight();
      inspectorCard.classList.remove('is-visible');
    });

    // Accordion expand/collapse inside sidebar cards
    document.querySelectorAll('.layer-card-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        const card = header.closest('.layer-card');
        card.classList.toggle('is-expanded');
      });
    });

    // Layer Checkboxes
    chkPolaRuang.addEventListener('change', (e) => {
      if (layers.pola) {
        if (e.target.checked) map.addLayer(layers.pola);
        else map.removeLayer(layers.pola);
      }
    });

    sliderOpacityPola.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      lblOpacityPola.textContent = `${Math.round(val * 100)}%`;
      if (layers.pola) {
        layers.pola.setStyle({ fillOpacity: val });
      }
    });

    chkBuildings.addEventListener('change', (e) => {
      if (layers.buildings) {
        if (e.target.checked) map.addLayer(layers.buildings);
        else map.removeLayer(layers.buildings);
      }
    });

    sliderOpacityBldg.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      lblOpacityBldg.textContent = `${Math.round(val * 100)}%`;
      if (layers.buildings) {
        layers.buildings.setStyle({ fillOpacity: val });
      }
    });

    chkDesa.addEventListener('change', (e) => {
      if (layers.desa) {
        if (e.target.checked) map.addLayer(layers.desa);
        else map.removeLayer(layers.desa);
      }
    });

    chkTransport.addEventListener('change', (e) => {
      if (layers.transport) {
        if (e.target.checked) map.addLayer(layers.transport);
        else map.removeLayer(layers.transport);
      }
    });

    chkSungai.addEventListener('change', (e) => {
      if (layers.sungai) {
        if (e.target.checked) map.addLayer(layers.sungai);
        else map.removeLayer(layers.sungai);
      }
    });

    chkPoi.addEventListener('change', (e) => {
      if (layers.poi) {
        if (e.target.checked) map.addLayer(layers.poi);
        else map.removeLayer(layers.poi);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 10. Startup Initialization                                         */
  /* ------------------------------------------------------------------ */

  initMap();
  setupUIEvents();
  setupSearch();
  setupMeasurement();
  loadData();

})();

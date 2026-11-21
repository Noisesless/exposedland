/**
 * SIMTARU KADASTER SATELIT 2026 — INSPECTOR LOGIC
 * High-performance Leaflet canvas renderer for 8.595 AI-traced building polygons
 * Superimposed directly on high-definition Google Satellite 2026 tiles
 */

(function () {
  'use strict';

  // 1. Color Palettes
  const DESA_COLORS = {
    'Kel.Krandegan': '#ef4444',
    'Kel.Kutabanjarnegara': '#f97316',
    'Kel.Semampir': '#f59e0b',
    'Kel.Parakancanggah': '#10b981',
    'Kel.Sokanandi': '#06b6d4',
    'Kel.Semarang': '#3b82f6',
    'Kel.Wangon': '#8b5cf6',
    'Kel.Karangtengah': '#ec4899',
    'Kel. Argasoka': '#14b8a6',
    'Desa Tlagawera': '#84cc16',
    'Desa Cendana': '#eab308',
    'Desa Sokayasa': '#a855f7',
    'Desa Ampelsari': '#6366f1'
  };

  // State Variables
  let map;
  let basemaps = {};
  let currentBasemap = 'google';
  let canvasRenderer;
  let buildingsLayer = null;
  let boundaryLayer = null;
  let rawBuildingsData = null;
  let activeDesaFilter = 'ALL';
  let selectedFeatureLayer = null;
  let selectedFeatureData = null;

  // DOM Elements
  const sliderOpacity = document.getElementById('slider-opacity');
  const lblOpacityVal = document.getElementById('lbl-opacity-val');
  const chkWireframe = document.getElementById('chk-wireframe');
  const chkBoundary = document.getElementById('chk-boundary');
  const selectDesa = document.getElementById('select-desa');
  const btnResetDesa = document.getElementById('btn-reset-desa');
  const lblTotalPersil = document.getElementById('lbl-total-persil');
  const panel = document.getElementById('kds-panel');
  const btnTogglePanel = document.getElementById('btn-toggle-panel');
  const btnOpenPanel = document.getElementById('btn-open-panel');
  const inspector = document.getElementById('kds-inspector');
  const btnCloseInspector = document.getElementById('btn-close-inspector');
  const btnZoomFeature = document.getElementById('btn-zoom-feature');

  // Inspector Fields
  const inspTitle = document.getElementById('insp-title');
  const inspDesa = document.getElementById('insp-desa');
  const inspArea = document.getElementById('insp-area');
  const inspFloors = document.getElementById('insp-floors');
  const inspId = document.getElementById('insp-id');
  const inspCoords = document.getElementById('insp-coords');

  /* ------------------------------------------------------------------------- */
  /* 2. Map Initialization                                                     */
  /* ------------------------------------------------------------------------- */
  function initMap() {
    // Pusat peta: Alun-Alun Banjarnegara (-7.39617, 109.69515) pada zoom 16
    map = L.map('map', {
      center: [-7.39617, 109.69515],
      zoom: 16,
      minZoom: 13,
      maxZoom: 21,
      zoomControl: false
    });
    window.kdsMap = map;

    // Pindahkan zoom control ke kanan bawah
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Google Maps Satellite HD 2026 (Layer Penjiplak Asli)
    basemaps.google = L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 21,
      maxNativeZoom: 20,
      attribution: '&copy; Google Maps Satellite HD 2026'
    }).addTo(map);

    // Esri World Imagery (Validasi Silang)
    basemaps.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: '&copy; Esri World Imagery'
    });

    // Hardware-accelerated Canvas Renderer untuk 8.595 poligon
    canvasRenderer = L.canvas({ padding: 0.5 });
  }

  /* ------------------------------------------------------------------------- */
  /* 3. Dynamic Styling Engine                                                 */
  /* ------------------------------------------------------------------------- */
  function getSelectedColorScheme() {
    const checked = document.querySelector('input[name="color-scheme"]:checked');
    return checked ? checked.value : 'category';
  }

  function getBuildingStyle(feature) {
    const isWireframe = chkWireframe.checked;
    const opacity = parseFloat(sliderOpacity.value);
    const props = feature.properties || {};
    const area = props.area_m2 || 50;
    const desa = props.desa || '';
    const scheme = getSelectedColorScheme();

    let baseColor = '#38bdf8'; // Sky blue default
    let strokeColor = '#0284c7';

    if (scheme === 'category') {
      if (area <= 80) {
        baseColor = '#38bdf8'; // Rumah kecil (<80 m2)
        strokeColor = '#0284c7';
      } else if (area <= 250) {
        baseColor = '#f59e0b'; // Rumah sedang (80-250 m2)
        strokeColor = '#d97706';
      } else {
        baseColor = '#ef4444'; // Gedung/ruko besar (>250 m2)
        strokeColor = '#b91c1c';
      }
    } else if (scheme === 'desa') {
      baseColor = DESA_COLORS[desa] || '#38bdf8';
      strokeColor = baseColor;
    } else if (scheme === 'cadastral') {
      baseColor = '#f59e0b';
      strokeColor = '#fbbf24';
    }

    if (isWireframe) {
      return {
        renderer: canvasRenderer,
        fill: false,
        color: strokeColor,
        weight: 1.6,
        opacity: Math.max(opacity, 0.4)
      };
    }

    return {
      renderer: canvasRenderer,
      fill: true,
      fillColor: baseColor,
      fillOpacity: opacity,
      color: strokeColor,
      weight: 1.0,
      opacity: Math.min(opacity + 0.35, 1.0)
    };
  }

  /* ------------------------------------------------------------------------- */
  /* 4. Data Loading & Layer Construction                                      */
  /* ------------------------------------------------------------------------- */
  async function loadData() {
    try {
      const [bldgRes, boundaryRes] = await Promise.all([
        fetch('data/banjarnegara_buildings_satelit_2026.geojson'),
        fetch('../geojson/per-kecamatan/banjarnegara/batas_desa.geojson')
      ]);

      rawBuildingsData = await bldgRes.json();
      const boundaryData = await boundaryRes.json();

      // 1. Bangun Layer Batas 13 Kelurahan/Desa
      boundaryLayer = L.geoJSON(boundaryData, {
        style: {
          fill: false,
          color: '#fbbf24',
          weight: 2.2,
          dashArray: '5, 5',
          opacity: 0.9
        },
        interactive: false
      }).addTo(map);

      // 2. Bangun Layer Poligon Persil Satelit (8.595 fitur)
      renderBuildingsLayer();

    } catch (err) {
      console.error('Gagal memuat dataset kadaster satelit:', err);
    }
  }

  function renderBuildingsLayer() {
    if (!rawBuildingsData) return;

    if (buildingsLayer) {
      map.removeLayer(buildingsLayer);
      buildingsLayer = null;
    }

    // Filter per desa jika dipilih
    const filteredFeatures = activeDesaFilter === 'ALL'
      ? rawBuildingsData.features
      : rawBuildingsData.features.filter(f => f.properties.desa === activeDesaFilter);

    lblTotalPersil.textContent = `${filteredFeatures.length.toLocaleString('id-ID')} Persil`;

    const filteredGeoJson = {
      type: 'FeatureCollection',
      features: filteredFeatures
    };

    buildingsLayer = L.geoJSON(filteredGeoJson, {
      renderer: canvasRenderer,
      style: getBuildingStyle,
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        
        // Tooltip cepat
        layer.bindTooltip(`
          <strong>${props.id}</strong><br/>
          <span>${props.name}</span><br/>
          <small>Luas: ${props.area_m2} m² • ${props.est_floors} Lt</small>
        `, {
          direction: 'top',
          offset: [0, -4],
          className: 'kds-tooltip'
        });

        // Event Klik Inspeksi
        layer.on({
          click: (e) => {
            L.DomEvent.stopPropagation(e);
            inspectBuilding(feature, layer);
          },
          mouseover: () => {
            if (layer !== selectedFeatureLayer) {
              layer.setStyle({ weight: 2.5, color: '#ffffff', fillOpacity: 0.9 });
            }
          },
          mouseout: () => {
            if (layer !== selectedFeatureLayer && buildingsLayer) {
              buildingsLayer.resetStyle(layer);
            }
          }
        });
      }
    }).addTo(map);
  }

  /* ------------------------------------------------------------------------- */
  /* 5. Inspection Engine                                                      */
  /* ------------------------------------------------------------------------- */
  function inspectBuilding(feature, layer) {
    if (selectedFeatureLayer && buildingsLayer) {
      buildingsLayer.resetStyle(selectedFeatureLayer);
    }

    selectedFeatureLayer = layer;
    selectedFeatureData = feature;

    // Highlight persil terpilih
    layer.setStyle({
      fill: true,
      fillColor: '#ffffff',
      fillOpacity: 0.95,
      color: '#0284c7',
      weight: 3.0
    });

    const props = feature.properties;
    const center = layer.getBounds().getCenter();

    inspTitle.textContent = props.name || `Persil #${props.id}`;
    inspDesa.textContent = `${props.desa}, Kec. Banjarnegara`;
    inspArea.innerHTML = `${props.area_m2.toLocaleString('id-ID')} m&sup2;`;
    inspFloors.textContent = `${props.est_floors} Lantai`;
    inspId.textContent = props.id;
    inspCoords.textContent = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;

    inspector.classList.add('is-visible');
  }

  function clearSelectedBuilding() {
    if (selectedFeatureLayer && buildingsLayer) {
      buildingsLayer.resetStyle(selectedFeatureLayer);
    }
    selectedFeatureLayer = null;
    selectedFeatureData = null;
    inspector.classList.remove('is-visible');
  }

  /* ------------------------------------------------------------------------- */
  /* 6. UI Events & Controls                                                   */
  /* ------------------------------------------------------------------------- */
  function setupUIEvents() {
    // 1. Slider Opacity
    sliderOpacity.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      lblOpacityVal.textContent = `${Math.round(val * 100)}%`;
      if (buildingsLayer) {
        buildingsLayer.eachLayer(l => l.setStyle(getBuildingStyle(l.feature)));
      }
    });

    // 2. Wireframe Toggle
    chkWireframe.addEventListener('change', () => {
      if (buildingsLayer) {
        buildingsLayer.eachLayer(l => l.setStyle(getBuildingStyle(l.feature)));
      }
    });

    // 3. Batas Desa Toggle
    chkBoundary.addEventListener('change', (e) => {
      if (boundaryLayer) {
        if (e.target.checked) map.addLayer(boundaryLayer);
        else map.removeLayer(boundaryLayer);
      }
    });

    // 4. Color Scheme Radios
    document.querySelectorAll('input[name="color-scheme"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (buildingsLayer) {
          buildingsLayer.eachLayer(l => l.setStyle(getBuildingStyle(l.feature)));
        }
      });
    });

    // 5. Filter Desa Dropdown
    selectDesa.addEventListener('change', (e) => {
      activeDesaFilter = e.target.value;
      renderBuildingsLayer();
      if (buildingsLayer && buildingsLayer.getBounds().isValid()) {
        map.fitBounds(buildingsLayer.getBounds(), { padding: [50, 50], maxZoom: 18 });
      }
    });

    btnResetDesa.addEventListener('click', () => {
      selectDesa.value = 'ALL';
      activeDesaFilter = 'ALL';
      renderBuildingsLayer();
      if (buildingsLayer && buildingsLayer.getBounds().isValid()) {
        map.fitBounds(buildingsLayer.getBounds(), { padding: [40, 40] });
      }
    });

    // 6. Basemap Selector
    document.querySelectorAll('.kds-btn-basemap').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.basemap;
        if (target === currentBasemap) return;

        document.querySelectorAll('.kds-btn-basemap').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        map.removeLayer(basemaps[currentBasemap]);
        map.addLayer(basemaps[target]);
        currentBasemap = target;
      });
    });

    // 7. Presets Focus Buttons
    document.querySelectorAll('.kds-btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.dataset.lat);
        const lon = parseFloat(btn.dataset.lon);
        const zoom = parseInt(btn.dataset.zoom, 10);
        map.flyTo([lat, lon], zoom, { duration: 1.2 });
      });
    });

    // 8. Zoom to Selected Feature
    btnZoomFeature.addEventListener('click', () => {
      if (selectedFeatureLayer) {
        map.fitBounds(selectedFeatureLayer.getBounds(), { maxZoom: 19, padding: [100, 100] });
      }
    });

    // 9. Close Inspector
    btnCloseInspector.addEventListener('click', () => {
      clearSelectedBuilding();
    });

    // 10. Toggle Left Panel
    btnTogglePanel.addEventListener('click', () => {
      panel.classList.add('is-hidden');
      btnOpenPanel.classList.add('is-visible');
    });

    btnOpenPanel.addEventListener('click', () => {
      panel.classList.remove('is-hidden');
      btnOpenPanel.classList.remove('is-visible');
    });

    // 11. Map Click Outside
    map.on('click', () => {
      clearSelectedBuilding();
    });
  }

  /* ------------------------------------------------------------------------- */
  /* 7. Startup Execution                                                      */
  /* ------------------------------------------------------------------------- */
  initMap();
  setupUIEvents();
  loadData();

})();

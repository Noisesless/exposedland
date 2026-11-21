# Graf Dependensi & Analisis Dampak — Serayu

Dokumen ini memetakan ketergantungan antar-berkas, dependensi pustaka pihak ketiga, dan analisis tingkat dampak perubahan terhadap keseluruhan sistem.

---

## 1. Critical Files (Paling Banyak Di-import / Berdampak Luas)

| File | Tipe | Peran & Dampak | Dependen |
|---|---|---|---|
| `web/app.js` | JavaScript Runtime | Inti viewer utama 2D: state machine, layer controller, Leaflet canvas integration. | `web/index.html` |
| `web/space.js` | JavaScript Runtime | Inti portal URA SPACE: spatial dataset replacement, ITBX regulatory logic, property inspector, measurement. | `web/space.html` |
| `web/3d.js` | JavaScript Runtime | Inti viewer 3D: Three.js WebGL scene, elevation terrain mesh generation, OrbitControls, 3D exporter. | `web/3d.html` |
| `web/peta-dasar.js` | JavaScript Module | Provider ubin satelit (Google, Esri, EOX) dan jalan dengan failover multi-provider. | `web/app.js`, `web/banding.js` |
| `tools/generator_model_3d.py` | Python Script | Generator aset 3D & DEM clipping berbasis SRTM 30m dan OpenTopography. | `web/3d.js` |
| `web/data/desa_clipped_layers.json` | Spatial Store | Dataset terklip 13 kelurahan (6.18 MB) untuk isolasi instan nol-lag. | `web/space.js` |
| `scripts/convert.py` | Python ETL Script | Skrip konversi utama dari data mentah SIMTARU ke GeoJSON bersih WGS84. | Seluruh dataset di `geojson/` |

---

## 2. High-Impact Files (Ubah = Efek Sektoral Luas)

| File | Depends On | Used By | Tingkat Dampak | Keterangan |
|---|---|---|---|---|
| `web/space.css` | CSS Variables | `web/space.html` | **TINGGI** | Desain sistem URA Singapore (sidebar 380px, inspector card 360px, chips grid). |
| `web/3d.css` | CSS Variables | `web/3d.html` | **SEDANG** | Dark-mode HUD interface untuk kontrol 3D Three.js. |
| `web/data/kecamatan_banjarnegara_buildings.geojson` | OSM Footprints | `web/space.js` | **SEDANG** | 10.918 bangunan kadaster perkotaan. |
| `web/data/kecamatan_banjarnegara_poi.json` | GPS / SK Bupati | `web/space.js` | **SEDANG** | 12 titik fasilitas publik terkalibrasi. |
| `serve.ps1` | Python / PowerShell | Lingkungan Dev | **SEDANG** | Launcher HTTP server lokal dengan deteksi port dinamis. |

---

## 3. Leaf Files (Aman Diubah — Dampak Terisolasi)

| File | Kategori | Deskripsi |
|---|---|---|
| `web/vendor/three.min.js` | Vendor Library | Three.js r128 WebGL rendering engine. |
| `web/vendor/OrbitControls.js` | Vendor Library | Kontrol kamera mouse/touch untuk visualisasi 3D. |
| `web/banding.html` / `web/banding.js` | Feature | Antarmuka swipe komparasi dua peta. |
| `.docs/*.md` | Dokumentasi | 9 berkas SSOT dokumentasi arsitektur, API, DB, dan desain. |

---

## 4. Third-Party Runtime & CDN Matrix

| Pustaka / Aset | Sumber / Lisensi | Ukuran | Integrasi |
|---|---|---|---|
| **Leaflet 1.9.4** | unpkg CDN / BSD-2 | ~140 KB | `web/index.html`, `web/banding.html`, `web/space.html` |
| **Three.js r128** | Local Vendor / MIT | ~580 KB | `web/3d.html` via `web/vendor/three.min.js` |
| **OrbitControls** | Local Vendor / MIT | ~28 KB | `web/3d.html` via `web/vendor/OrbitControls.js` |
| **Google Satelit Tiles** | Google Maps Service | Raster PNG/JPG | `web/peta-dasar.js` (`mt{s}.google.com`) |
| **Esri Canvas Gray** | Esri Online Basemap | Raster PNG/JPG | `web/space.js` (Peta dasar profesional URA style) |

# Spesifikasi API & Kontrak Data — Serayu

Arsitektur aplikasi Serayu bersifat **100% Client-Side Static GIS**. Oleh karena itu, antarmuka antarkomponen didasarkan pada **Static GeoJSON & JSON Data Contract** yang di-fetch langsung oleh browser melalui protokol HTTP GET.

Dokumen ini mendefinisikan seluruh struktur payload, endpoint data statis, parameter, dan skema respons.

---

## 1. Registry & Index Endpoints

### 1.1 Manifest Sistem
- **Path:** `/geojson/manifest.json`
- **Metode:** `GET`
- **MIME Type:** `application/json; charset=utf-8`
- **Kegunaan:** Metadata agregat seluruh berkas dalam pipeline konversi.
- **Skema Respons:**
```json
{
  "sumber": "https://simtaru.banjarnegarakab.go.id/json/",
  "crs_keluaran": "EPSG:4326 (WGS84)",
  "crs_sumber": {
    "pola_ruang": "EPSG:4326",
    "batas_desa": "EPSG:32749",
    "transportasi": "EPSG:4326",
    "sungai": "EPSG:32749"
  },
  "dibuat": "2026-11-21",
  "ambang_sliver_m2": 100.0,
  "desimal_koordinat": 6,
  "layers": {
    "pola_ruang": { "file": "full/pola_ruang.geojson", "fitur": 10816, "ukuran_mb": 37.32, "total_ha": 114484.74 },
    "batas_desa": { "file": "full/batas_desa.geojson", "fitur": 278, "ukuran_mb": 2.58, "total_ha": 114489.62 },
    "transportasi": { "file": "full/transportasi.geojson", "fitur": 262, "ukuran_mb": 1.06, "total_ha": null },
    "sungai": { "file": "full/sungai.geojson", "fitur": 3332, "ukuran_mb": 2.76, "total_ha": null }
  }
}
```

### 1.2 Indeks Daftar Kecamatan
- **Path:** `/geojson/index/daftar_kecamatan.json`
- **Metode:** `GET`
- **Kegunaan:** Mengisi dropdown kecamatan, menyediakan koordinat batas wilayah (`bbox`), centroid kamera, dan total luas per kecamatan.

---

## 2. Endpoints Detail Perkotaan & Kadaster (Modul URA SPACE)

### 2.1 Dataset Terpotong Spasial 13 Kelurahan/Desa
- **Path:** `/web/data/desa_clipped_layers.json`
- **Metode:** `GET`
- **Ukuran:** $6,18\text{ MB}$ (Static Cacheable)
- **Skema Respons:**
```typescript
interface DesaClippedLayers {
  [desaName: string]: {
    pola: GeoJSON.FeatureCollection;       // Pola ruang terklip batas desa
    transport: GeoJSON.FeatureCollection;  // Jalan di dalam batas desa
    sungai: GeoJSON.FeatureCollection;     // Sungai di dalam batas desa
    buildings: GeoJSON.FeatureCollection;  // Persil bangunan di dalam batas desa
    boundary: GeoJSON.Feature;             // Poligon batas desa tunggal
    poi: Array<{                           // Titik fasilitas publik di desa
      id: string;
      nama: string;
      kategori: string;
      desa: string;
      lat: number;
      lon: number;
      keterangan: string;
    }>;
  };
}
```

### 2.2 Persil Bangunan Kadaster
- **Path:** `/web/data/kecamatan_banjarnegara_buildings.geojson`
- **Metode:** `GET`
- **Ukuran:** $4,3\text{ MB}$ (10.918 bangunan)
- **Struktur Fitur:**
```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[109.69, -7.39], ...]] },
  "properties": {
    "id": 304467437,
    "name": "Bundaran Alun-Alun Banjarnegara",
    "type": "building",
    "desa": "Kel.Krandegan",
    "area_m2": 34.3,
    "est_floors": 1
  }
}
```

### 2.3 Fasilitas Publik & Landmark (12 Lokasi)
- **Path:** `/web/data/kecamatan_banjarnegara_poi.json`
- **Metode:** `GET`
- **Skema Item:**
```json
{
  "id": "POI-001",
  "nama": "Alun-Alun Banjarnegara",
  "kategori": "Ruang Terbuka Hijau & Publik",
  "desa": "Kel.Kutabanjarnegara",
  "lat": -7.39617,
  "lon": 109.69515,
  "keterangan": "Pusat aktivitas masyarakat, cagar budaya beringin kurung, dan titik nol kilometer kota."
}
```

---

## 3. Endpoints Peta Dasar (Basemap External Contracts)

| Provider | URL Template | Subdomains | Native Zoom |
|---|---|---|---|
| **Google Satellite** | `https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` | `['0','1','2','3']` | 20 |
| **Esri World Imagery** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | N/A | 19 |
| **Esri Street Map** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}` | N/A | 18 |
| **Esri World Gray** | `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}` | N/A | 16 |

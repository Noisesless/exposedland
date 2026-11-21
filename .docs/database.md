# Skema Basis Data & Geospasial — Serayu

Proyek Serayu mengadopsi model **File-Based Spatial Database (Flat-File GeoJSON Data Store)**. Seluruh relasi spasial, atribut zonasi, dan topologi disimpan dalam bentuk berkas GeoJSON terstruktur yang divalidasi menurut standar **RFC 7946**.

---

## 1. Referensi Koordinat & Proyeksi (Spatial Reference Systems)

| Parameter | Sumber Mentah (SIMTARU) | Format Keluaran Standar (Canonical) | Modul 3D |
|---|---|---|---|
| **CRS / Proyeksi** | Campuran: WGS84 (`EPSG:4326`) & UTM 49S (`EPSG:32749`) | **WGS84 (`EPSG:4326`)** seragam di seluruh layer 2D | **UTM Zone 49S (`EPSG:32749`)** satuan meter untuk mesh Z elevasi |
| **Dimensi Geometri** | 3D (`POLYGON Z`, `LINESTRING Z`) | **2D murni** (elevasi Z dipangkas tanpa data loss) | **3D Mesh Vertices** ($x, y, z$) |
| **Presisi Koordinat** | Floating point tak terbatas | **6 desimal** ($\approx 0,11\text{ meter}$ presisi tanah) | Normalisasi $0.0 - 1.0$ pada shader kanvas |
| **Ring Poligon** | Sering terbuka di sumber mentah | **Tertutup rapat** (first point == last point) | Index buffer segitiga (Triangulation) |
| **Kalkulasi Luas** | Atribut `LUASHA` planar bias (+1,12%) | **`luas_ha_geo`** dihitung geodesik ellipsoid WGS84 | Luas bidang horizontal planar meter persegi |

---

## 2. Entitas Data Spasial Utama

### 2.1 Pola Ruang Kabupaten (`pola_ruang`)
- **Tipe Geometri:** `Polygon` / `MultiPolygon`
- **Total Fitur:** 10.816 poligon bersih (setelah eliminasi sliver)
- **Total Luas:** 114.484,74 ha geodesik
- **Kamus Data & Klasifikasi (Permen ATR/BPN No. 1/2020):**
  - 13 kelas: Hortikultura, Perkebunan, Hutan Produksi Terbatas, Tanaman Pangan, Permukiman Perdesaan, Permukiman Perkotaan, Hutan Lindung, Badan Air, Peruntukan Industri, Hutan Produksi Tetap, Cagar Alam, Keunikan Batuan & Fosil, Cagar Budaya.

### 2.2 Batas Administrasi (`batas_desa` & `batas_kecamatan`)
- **Unit Administrasi:** 20 Kecamatan, 278 Desa/Kelurahan
- **Total Luas Geodesik:** 114.489,62 ha (selisih terhadap Pola Ruang hanya 4,88 ha / 0,004%).

### 2.3 Jaringan Transportasi (`transportasi`)
- **Tipe Geometri:** `LineString` / `MultiLineString`
- **Total Ruas Asal:** 262 ruas (total panjang $\sim 1.124\text{ km}$).

### 2.4 Jaringan Hidrologi (`sungai`)
- **Tipe Geometri:** `LineString` / `MultiLineString`
- **Total Fitur:** 3.332 ruas alur sungai (Sungai Serayu, K. Palet, K. Urang, dll).

---

## 3. Entitas Data Spesifik Kecamatan Banjarnegara (Modul URA SPACE)

### 3.1 Persil Bangunan Kadaster (`kecamatan_banjarnegara_buildings.geojson`)
- **Lokasi Berkas:** `web/data/kecamatan_banjarnegara_buildings.geojson` (Ukuran: $4,3\text{ MB}$)
- **Total Fitur:** 10.918 bangunan
- **Struktur Atribut:**
```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [...] },
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

### 3.2 Fasilitas Publik & Landmark (`kecamatan_banjarnegara_poi.json`)
- **Lokasi Berkas:** `web/data/kecamatan_banjarnegara_poi.json`
- **Total Entitas:** 12 titik landmark terkalibrasi presisi nyata GPS/OSM/SK Bupati:
  1. Alun-Alun Banjarnegara (`-7.39617, 109.69515`)
  2. Pendopo Dipayuda Adigraha & Kantor Bupati (`-7.39525, 109.69578`)
  3. Masjid Agung An-Nuur Banjarnegara (`-7.39611, 109.69407`)
  4. Bappeda Kabupaten Banjarnegara (`-7.39490, 109.69630`)
  5. Dinas PUPR Kabupaten Banjarnegara (`-7.39780, 109.69550`)
  6. RSUD Hj. Anna Lasmanah (`-7.39322, 109.69324`)
  7. Stadion Soemitro Kolopaking (`-7.39300, 109.70520`)
  8. Pasar Kota (Pasar Induk Banjarnegara) (`-7.39423, 109.70133`)
  9. Stasiun Banjarnegara (Cagar Budaya SDS/NIS) (`-7.39651, 109.70277`)
  10. Sentra Kuliner Dawet Ayu Krandegan (`-7.39630, 109.69750`)
  11. Taman Kota & Hutan Kota Sokanandi (`-7.39550, 109.71850`)
  12. Kantor Kecamatan Banjarnegara (`-7.39950, 109.69580`)

### 3.3 Dataset Terpotong Spasial (`desa_clipped_layers.json`)
- **Lokasi Berkas:** `web/data/desa_clipped_layers.json` (Ukuran: $6,18\text{ MB}$)
- **Format:** Dictionary terindeks nama 13 kelurahan/desa (`Kel.Krandegan`, `Desa Tlagawera`, `Kel.Kutabanjarnegara`, dsb).
- **Sub-Key per Kelurahan:**
  - `pola`: `FeatureCollection` Pola Ruang yang beririsan dan terpotong tepat pada batas desa.
  - `transport`: `FeatureCollection` jalan yang terpotong di dalam batas desa.
  - `sungai`: `FeatureCollection` aliran air di dalam batas desa.
  - `buildings`: `FeatureCollection` bangunan di dalam desa.
  - `boundary`: `Feature` batas poligon kelurahan tersebut.
  - `poi`: Array titik landmark di dalam kelurahan tersebut.

---

## 4. Indeks Spasial & Strategi Query

1. **Python STRtree Clipping:** Algoritma R-Tree spatial indexing memotong seluruh layer terhadap poligon administrasi secara offline sehingga browser tidak perlu melakukan komputasi intersection yang membebani CPU.
2. **Instant In-Memory Swapping:** Saat pengguna memilih desa pada UI, seluruh layer Leaflet langsung diganti dari cache in-memory tanpa request jaringan berulang.

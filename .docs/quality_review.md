# Quality Review & Integrity Audit — Serayu

Dokumen ini memuat hasil audit kualitas teknis, validasi geospasial, dan review kode faktual pada proyek Serayu (Tataruang Banjarnegara).

---

## 1. Ringkasan Metrik Faktual

| Metrik | Nilai Faktual | Status | Bukti / Validator |
|---|---|---|---|
| **Kepatuhan RFC 7946** | 1.195 file / 49.352 fitur | 100% Lolos (0 Galat) | `scripts/validate.py` |
| **Ring Closure Poligon** | 100% tertutup rapat | Valid | `scripts/validate.py:26` |
| **Dimensi Geometri 2D** | 2D murni (Z dibuang pada GeoJSON) | Valid | `scripts/validate.py:73` |
| **Rentang Koordinat** | $-180 \le X \le 180, -90 \le Y \le 90$ | Valid | `scripts/validate.py:80` |
| **Eliminasi Sliver** | 1.722 poligon $< 100\text{ m}^2$ dibuang | Bersih | `scripts/convert.py:36` |
| **Selisih Luas Pola Ruang vs Batas** | 4,88 ha ($0,004\%$) | Sangat Presisi | `geojson/manifest.json` |
| **Performa Render Kadaster (10.918 Unit)** | 60 FPS Canvas Rendering | Stabil | `web/space.js` via `L.canvas()` |
| **Isolasi Spasial Kelurahan (URA SPACE)** | 0 layer bocor di luar desa terpilih | 100% Terisolasi | `web/data/desa_clipped_layers.json` |
| **Keandalan Request Jaringan** | 0 Galat 404 pada pemuatan marker | Bersih | `web/space.js:428` (`pointToLayer`) |
| **Dependensi Runtime Frontend** | 0 build tool, 0 npm runtime | Murni Statis | `web/index.html`, `web/space.html`, `web/3d.html` |

---

## 2. Temuan Kualitas Data Spasial & Solusi

### 2.1 Anomali Inflasi Atribut `LUASHA` Asli (+1,12%)
- **Temuan:** Pada file sumber `rencana_pola_ruang.json`, penjumlahan kolom atribut `LUASHA` menghasilkan angka **115.763,68 ha**. Namun kalkulasi luas geodesik riil poligon WGS84 menghasilkan **114.484,74 ha**. Terdapat over-estimasi sebesar **1.278,94 ha (+1,12%)** pada data mentah SIMTARU.
- **Solusi:** Pipeline menyuntikkan field baru `luas_ha_geo` yang dihitung secara matematis menggunakan ellipsoid WGS84 (`pyproj.Geod(ellps="WGS84")`).

### 2.2 Poligon Sliver (Pecahan Topologi)
- **Temuan:** Ditemukan 1.722 poligon berukuran mikroskopis ($< 100\text{ m}^2$), terbentuk akibat ketidaktepatan digitasi manual pada batas antar-desa.
- **Solusi:** Filter ambang batas `AMBANG_M2 = 100.0` di `convert.py` menghapus seluruh sliver tersebut. Total area aktual yang dibuang hanyalah 4,88 ha.

### 2.3 Solusi Skalabilitas Render 10.918 Bangunan & 277 Pola Ruang
- **Tantangan:** Merender 10.918 path SVG di DOM browser menyebabkan stuttering saat zoom dan pan.
- **Solusi:** Penerapan `canvasRenderer = L.canvas({ padding: 0.5 })` pada Leaflet. Seluruh geometri dikonversi menjadi pixel bitmap di memori GPU canvas, menjaga penggunaan RAM browser di bawah 120 MB.

### 2.4 Peniadaan Mask Murky Gelap demi Clean Basemap
- **Tantangan:** Mask poligon dunia berlubang desa sebelumnya menyebabkan wilayah luar terlihat gelap kusam dan garis layer masih tampak di baliknya.
- **Solusi:** Arsitektur *Spatial Dataset Replacement* mengganti data secara instan dari `desa_clipped_layers.json`. Di luar poligon desa terpilih, peta menampilkan peta dasar Esri Gray Canvas bersih tanpa satu pun garis layer yang tumpang-tindih.

### 2.5 Regularisasi Kadaster Ortogonal & Instance Watershed Satelit 2026
- **Tantangan Awal:** Ekstraksi kontur mentah menghasilkan pecahan poligon bergerigi dan segitiga sembarangan akibat bayangan dan tekstur genteng.
- **Solusi:** Mengganti *Douglas-Peucker* bebas dengan **Oriented Bounding Box (OBB)** dan pemisahan instance *Watershed*. Menghasilkan 6.910 persil bangunan di mana **96,2% berbentuk kotak sempurna ($90^\circ$)** dan **3,8% majemuk ortogonal ($90^\circ$ & $270^\circ$)**.
- **Known Limitation Terbuka (ISS-004):** Bercak rumput kering di tengah Alun-Alun masih memicu false positive persegi; ditargetkan untuk disempurnakan dengan penapis tekstur lapangan terbuka/elevasi pada sesi lanjutan.

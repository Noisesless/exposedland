# Serayu — Platform Geospasial & Peta Interaktif Tata Ruang Banjarnegara

Konversi dan visualisasi data tata ruang dari [SIMTARU Banjarnegara](https://simtaru.banjarnegarakab.go.id/) menjadi GeoJSON bersih, dipecah per kecamatan dan per desa, dilengkapi suite aplikasi web GIS 2D, visualisasi topografi 3D, serta portal perkotaan berbasis Singapore URA SPACE. Namanya diambil dari Sungai Serayu yang membelah kabupaten ini.

- **Cakupan Wilayah:** 20 kecamatan, 278 desa/kelurahan, total luas geodesik **114.484,74 ha**.
- **Data Spasial:** 10.816 poligon pola ruang (13 kelas), 3.332 ruas sungai, 262 ruas jalan, dan 10.918 persil bangunan kadaster.
- **Akurasi Topologi:** Selaras hingga **4,88 ha (0,004%)** antara pola ruang dan batas administrasi; 100% lolos RFC 7946 (0 masalah dari 1.195 berkas).
- **Arsitektur:** **0 Build Step**, 0 API Key berbayar, 0 Server GIS berat (100% Client-Side Static Jamstack).

---

## 🚀 Modul Aplikasi Web

Aplikasi Serayu menyediakan 4 antarmuka interaktif yang dapat diakses langsung melalui peramban:

| Modul | File URL | Fitur Utama |
|---|---|---|
| **1. Web GIS Hierarkis 2D** | [`/web/index.html`](web/index.html) | Viewer interaktif 3 tingkat (Kabupaten → Kecamatan → Desa), toggle Rencana Pola Ruang & Rawan Bencana (KRB), multibasemap. |
| **2. Split-Screen Comparator** | [`/web/banding.html`](web/banding.html) | Analisis komparasi swipe slider dua peta berdampingan antara zonasi RTRW vs kepadatan fisik bangunan satelit. |
| **3. SIMTARU SPACE (Kec. Banjarnegara)** | [`/web/space.html`](web/space.html) | Portal perencanaan perkotaan terinspirasi **Singapore URA SPACE**: 10.918 bangunan kadaster, 277 zona pola ruang, aturan ITBX (Diizinkan, Terbatas, Bersyarat, Dilarang), isolasi kelurahan murni, dan 12 landmark presisi GPS. |
| **4. 3D Elevation & Landscape Visualizer** | [`/web/3d.html`](web/3d.html) | Visualisasi 3D WebGL Three.js berbasis elevasi DEM SRTM 30m nyata (UTM Zone 49S), gerombol hutan adaptif, dan ekspor model 3D (OBJ, GLTF, STL, 3MF). |

---

## ⚡ Menjalankan Aplikasi Secara Lokal

Jalankan skrip server statis bawaan:

```powershell
.\serve.ps1 -Port 8080
```

Buka salah satu tautan di peramban Anda:
- Viewer Kabupaten: `http://127.0.0.1:8080/web/`
- URA SPACE Kecamatan: `http://127.0.0.1:8080/web/space.html`
- Visualizer 3D: `http://127.0.0.1:8080/web/3d.html`
- Komparasi Swipe: `http://127.0.0.1:8080/web/banding.html`

*(Catatan: Wajib diakses lewat protokol HTTP/HTTPS lokal karena fetch GeoJSON dibatasi oleh kebijakan CORS peramban pada protokol `file://`)*.

---

## 📁 Struktur Direktori

```
serayu/
├── .docs/                    # Single Source of Truth (SSOT) Dokumentasi Lengkap
│   ├── architecture.md       # Arsitektur sistem 2D, 3D, dan URA Space
│   ├── api-spec.md           # Spesifikasi kontrak data statis & endpoint
│   ├── database.md           # Skema data spasial, kamus zonasi, dan kadaster
│   ├── design-system.md      # Token desain URA, palet RTRW, dan visual DNA
│   ├── dependency-graph.md   # Matriks dependensi pustaka dan berkas kritis
│   ├── deployment.md         # Panduan deployment Jamstack / Nginx / Cloudflare
│   ├── issues.md             # Issue tracker, anomali data, dan resolusi
│   ├── quality_review.md     # Audit integritas RFC 7946 & uji performa
│   └── routes.md             # Peta navigasi state aplikasi dan view hierarchy
├── data/                     # Metadata inventaris data mentah (DATA_INVENTORY.md)
├── geojson/                  # Dataset GeoJSON terstruktur (full, per-kecamatan, per-desa)
├── scripts/                  # Pipeline ETL & validasi data spasial (Python Shapely/Pyproj)
├── tools/                    # Tooling 3D generator (generator_model_3d.py) & uji headless
├── web/                      # Antarmuka frontend (HTML, CSS, JS, aset vendor)
│   ├── data/                 # Data detail bangunan kadaster, landmark, & clipped layers
│   ├── vendor/               # Three.js r128, OrbitControls
│   ├── index.html            # Viewer 2D utama
│   ├── space.html            # Portal SIMTARU SPACE (Kecamatan Banjarnegara)
│   ├── 3d.html               # Viewer elevasi 3D Three.js
│   └── banding.html          # Komparator split-screen
├── requirements.txt
└── serve.ps1
```

---

## 🛠️ Pipeline Pemrosesan Data (ETL)

Untuk membangun ulang seluruh lapisan data GeoJSON dari data mentah SIMTARU:

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python scripts\convert.py           # Reproyeksi WGS84, buang sliver, partisi kecamatan
.venv\Scripts\python scripts\ringkasan.py         # Kalkulasi ringkasan luas legenda geodesik
.venv\Scripts\python scripts\kabupaten_layer.py   # Generalisasi layer kabupaten (dissolve 25m)
.venv\Scripts\python scripts\desa_layer.py        # Pemotongan spasial 278 desa (STRtree clip)
.venv\Scripts\python scripts\validate.py          # Validasi integritas RFC 7946 (wajib 0 galat)
```

---

## 📚 Indeks Dokumentasi Teknis

Dokumentasi arsitektur mendalam dan spesifikasi regulasi tersedia pada direktori [/.docs/](.docs/):

1. [Arsitektur Sistem](.docs/architecture.md) — Alur data multi-tier, URA SPACE architecture, dan 3D terrain pipeline.
2. [Spesifikasi API & Kontrak Data](.docs/api-spec.md) — Struktur payload GeoJSON, atribut kadaster, dan endpoint satelit.
3. [Skema Basis Data Spasial](.docs/database.md) — Kamus data pola ruang, 10.918 bangunan kadaster, dan 12 landmark.
4. [Review Kualitas & Validasi](.docs/quality_review.md) — Uji kepatuhan RFC 7946, eliminasi sliver, dan canvas benchmark.
5. [Peta Rute & State](.docs/routes.md) — State machine navigasi, view hierarchy, dan isolasi kelurahan.
6. [Graf Dependensi](.docs/dependency-graph.md) — Analisis komponen kritis, leaf files, dan pustaka runtime.
7. [Panduan Deployment](.docs/deployment.md) — Rekomendasi Nginx gzip, Cloudflare Pages, dan matrix public-safe.
8. [Issue Tracker & Batasan](.docs/issues.md) — Riwayat resolusi bug (masking leakage, layout overlap, landmark recalibration).
9. [Design System & Kartografi](.docs/design-system.md) — Token desain URA Singapore, palet RTRW Permen ATR/BPN 1/2020.

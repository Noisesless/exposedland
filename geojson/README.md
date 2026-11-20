# GeoJSON Banjarnegara — hasil konversi SIMTARU

Dibuat: 21 November 2026 · Sumber: `https://simtaru.banjarnegarakab.go.id/json/`

Semua geometri sudah **EPSG:4326 (WGS84)**, 2D (Z dibuang), koordinat dibulatkan
6 desimal (~0,11 m), ring poligon tertutup, RFC 7946 valid. Divalidasi: **0 masalah**
dari 1.195 file / 49.352 fitur.

## Struktur

```
geojson/
├── manifest.json                  # ringkasan semua file + luas per kecamatan
├── index/
│   ├── batas_kecamatan.geojson    # 20 poligon (dissolve desa) — 0,78 MB
│   ├── kab_pola_ruang.geojson     # 13 kelas pola ruang, dissolve + simplify — 2,33 MB
│   ├── kab_krb.geojson            # 3 kategori rawan bencana, dissolve + simplify — 0,58 MB
│   ├── ringkasan.json             # luas per kelas per kecamatan (tanpa geometri)
│   ├── daftar_kecamatan.json      # daftar + bbox + centroid + path layer
│   └── daftar_desa.json           # 278 desa: bbox, luas, jumlah poligon, path layer — 105 KB
├── full/
│   ├── pola_ruang.geojson         # 10.816 fitur — 37,32 MB
│   ├── batas_desa.geojson         #   278 fitur —  2,58 MB
│   ├── sungai.geojson             #  3.332 fitur —  2,76 MB
│   └── transportasi.geojson       #   262 fitur —  1,06 MB
├── per-kecamatan/
│   ├── banjarmangu/
│   │   ├── pola_ruang.geojson
│   │   ├── batas_desa.geojson
│   │   ├── transportasi.geojson
│   │   └── sungai.geojson
│   └── ... (20 kecamatan, 80 file, 43,9 MB, rata-rata 0,55 MB)
└── per-desa/
    ├── banjarmangu/
    │   ├── banjarkulon/
    │   │   ├── batas_desa.geojson
    │   │   ├── pola_ruang.geojson
    │   │   ├── transportasi.geojson
    │   │   └── sungai.geojson
    │   └── ... (17 desa)
    └── ... (20 kecamatan, 1.108 file, 49,2 MB, rata-rata 45 KB)
```

Total 140,7 MB. Tiga tingkat pemuatan: **2,33 MB** (kabupaten) → **0,55 MB**
(kecamatan) → **45 KB** (desa).

## Cara pakai di aplikasi

1. Muat `index/batas_kecamatan.geojson` (0,78 MB) untuk polygon pemilihan wilayah,
   plus `index/kab_pola_ruang.geojson` + `index/kab_krb.geojson` untuk tampilan awal.
2. Saat pengguna memilih kecamatan, baca `index/daftar_kecamatan.json` → ambil
   `layers.<nama>` → muat hanya file kecamatan itu (0,2–3,6 MB).
3. Saat pengguna memilih desa, baca `index/daftar_desa.json` →
   `kecamatan.<kec>.desa[].layers` → muat `per-desa/<kec>/<desa>/pola_ruang.geojson`.
   Batas desa tetap diambil dari folder kecamatan supaya desa tetangga masih bisa diklik.
4. Jangan memuat `full/pola_ruang.geojson` (37 MB) di browser.

## Atribut tambahan dari konversi

| Field | Isi |
|---|---|
| `kecamatan` | nama kecamatan bersih (semua fitur) |
| `desa` | nama desa bersih — hanya di `per-desa/` (hasil klip spasial) |
| `luas_ha_geo` | luas geodesik (polygon), satuan hektar |
| `panjang_km_geo` | panjang geodesik (garis), satuan km |
| `slug` | slug folder (hanya di `index/batas_kecamatan.geojson`) |

## Catatan kualitas data

**Reproyeksi.** `batas_desa` dan `sungai` aslinya UTM 49S (EPSG:32749); `pola_ruang`
dan `transportasi` sudah WGS84. Keduanya kini seragam.

**Sliver dibuang.** 1.722 poligon < 100 m² dihapus (total hanya 4,88 ha). Nilai
`LUASHA` atribut pada poligon-poligon itu menjumlah 453 ha — bukti atribut `LUASHA`
tidak bisa dipercaya untuk fitur kecil.

**`LUASHA` sumber tidak akurat.** Pada `pola_ruang`, total `LUASHA` = 115.763,68 ha
sedangkan luas geodesik sebenarnya = 114.484,74 ha (atribut lebih besar **+1,12%**).
Gunakan `luas_ha_geo`. Pada `batas_desa`, `LUASHA` justru akurat.

**Batas sudah selaras.** Luas `pola_ruang` (114.484,74 ha) vs `batas_desa`
(114.489,62 ha) hanya beda **4,88 ha (0,004%)**. Klaim awal di inventaris bahwa ada
selisih 1,5% ternyata murni akibat atribut `LUASHA` yang salah, bukan geometri.

**Normalisasi nama kecamatan.** Sumber memakai format berbeda antar layer
(`WADMKC` = `"Kecamatan Sigaluh"`, `Kecamatan` = `"Kec.Susukan"`) sehingga
penggabungan per kecamatan gagal senyap. Semua sudah dinormalisasi ke nama bersih.
Typo `Purwarejaklampok` → `Purwareja Klampok`.

**Layer garis dipecah per kecamatan.** `transportasi` dan `sungai` tidak punya atribut
wilayah, jadi ditetapkan lewat klip spasial terhadap batas kecamatan. Di `per-kecamatan/`
garis benar-benar dipotong di batas (262 → 358 potongan, 3.332 → 3.595 potongan).
Di `full/` geometri tetap utuh, hanya diberi satu `kecamatan` berdasarkan tumpang-susun
terpanjang.

## Yang masih belum ada

Tidak ada matriks peraturan zonasi (KDB/KLB/KDH/ITBX per zona), tidak ada RDTR,
tidak ada struktur ruang terpisah. Harus diinput dari Perda RTRW.

## Script

| File | Fungsi |
|---|---|
| `scripts/convert.py` | pipeline konversi + split + verifikasi |
| `scripts/validate.py` | validasi independen RFC 7946 |
| `scripts/ringkasan.py` | ringkasan luas per kelas per kecamatan |
| `scripts/kabupaten_layer.py` | dissolve + simplify untuk layer tingkat kabupaten |
| `scripts/profile_raw.py` | profil data mentah |
| `scripts/analyze.py` | laporan atribut & luas |
| `scripts/crs_check.py` | deteksi CRS & bbox |

Jalankan ulang:

```powershell
cd I:\tataruang
.venv\Scripts\python.exe scripts\convert.py
.venv\Scripts\python.exe scripts\ringkasan.py
.venv\Scripts\python.exe scripts\kabupaten_layer.py
.venv\Scripts\python.exe scripts\validate.py
```

## Saran agar makin ringan

- Aktifkan **gzip/brotli** di web server: GeoJSON teks memampat ~5–8×, jadi
  `punggelan/pola_ruang.geojson` (3,28 MB) jadi ~450 KB.
- Bila perlu lebih kecil lagi, konversi ke **PMTiles/MBTiles** (vektor tile) dan
  sajikan per zoom — jauh lebih ringan daripada GeoJSON utuh, tapi butuh MapLibre GL.
- Untuk 12.538 poligon pola ruang, pertimbangkan **dissolve per `NAMOBJ`** bila
  hanya butuh tampilan zonasi (bukan per-parcel).

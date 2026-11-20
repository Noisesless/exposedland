# Serayu — peta interaktif tata ruang Kabupaten Banjarnegara

Konversi data tata ruang dari [SIMTARU Banjarnegara](https://simtaru.banjarnegarakab.go.id/)
menjadi GeoJSON bersih, dipecah per kecamatan dan per desa, plus viewer peta
statis untuk melihatnya. Namanya diambil dari Sungai Serayu, sungai yang
membelah kabupaten ini.

- **20 kecamatan, 278 desa, luas 114.484,74 ha** (geodesik)
- **10.816 poligon** pola ruang, 13 kelas; 3.332 ruas sungai; 262 ruas jalan
- Pola ruang dan batas administrasi **selaras sampai 4,88 ha (0,004%)**
- Validasi RFC 7946: **0 masalah** dari 1.195 file / 49.352 fitur
- Viewer: **tanpa build step**, tanpa API key, tanpa server backend

## Coba viewer-nya

```powershell
.\serve.ps1 -Port 8008
```

Buka URL yang dicetak (`http://127.0.0.1:8008/web/`). Wajib lewat server —
membuka `index.html` langsung dari Explorer gagal karena `fetch()` diblokir
pada protokol `file://`.

## Struktur

```
serayu/
├── data/                 # JSON mentah SIMTARU + DATA_INVENTORY.md
│                         #   (berkas .json tidak diunggah — terlalu besar)
├── scripts/              # pipeline konversi Python
│   ├── convert.py        #   JSON mentah -> GeoJSON bersih + pecah per kecamatan
│   ├── ringkasan.py      #   luas per kelas per kecamatan (untuk legenda)
│   ├── kabupaten_layer.py#   dissolve + simplify untuk tampilan kabupaten
│   ├── desa_layer.py     #   klip spasial -> pecah per desa
│   ├── validate.py       #   validasi RFC 7946 + kecocokan atribut/folder
│   └── profile_raw.py    #   profil atribut data mentah
├── geojson/              # hasil konversi (lihat geojson/README.md)
├── web/                  # viewer Leaflet (lihat web/README.md)
├── tools/                # uji headless Chrome + tangkap layar
├── requirements.txt
└── serve.ps1
```

## Alur data

```
data/*.json  →  convert.py  →  geojson/full/          (4 berkas, 44 MB)
                                   ↓
                    ┌──────────────┴──────────────┐
              per-kecamatan/                  index/
              (80 file, 44 MB)          (batas_kecamatan, kab_pola_ruang,
                    ↓                    kab_krb, ringkasan, daftar_*)
              desa_layer.py
                    ↓
              per-desa/ (1.108 file, 49 MB)
```

Semua geometri: **EPSG:4326, 2D**, koordinat 6 desimal (~0,11 m). Sumber aslinya
campuran — `batas_administrasi` dan `sungai` memakai EPSG:32749 (UTM 49S),
`rencana_pola_ruang` dan `jaringan_transportasi` sudah 4326.

## Membangun ulang dari data mentah

Data mentah tidak disertakan di repo karena ukurannya (72 MB, dengan satu berkas
63 MB). Untuk membangun ulang:

1. Unduh empat berkas JSON dari SIMTARU ke `data/` — daftar nama dan cara
   mengambilnya ada di `data/DATA_INVENTORY.md`.
2. Jalankan pipeline:

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python scripts\convert.py           # ± 44 detik
.venv\Scripts\python scripts\ringkasan.py
.venv\Scripts\python scripts\kabupaten_layer.py
.venv\Scripts\python scripts\desa_layer.py
.venv\Scripts\python scripts\validate.py          # harus 0 masalah
```

## Menguji viewer

```powershell
cd tools; npm install; cd ..
node tools\uji_viewer.js      # 30 pemeriksaan: kabupaten -> kecamatan -> desa
node tools\tangkap.js         # tangkapan layar untuk dokumentasi
```

## Catatan

- Angka luas memakai `luas_ha_geo` (hasil hitung geodesik), bukan atribut
  `LUASHA` bawaan yang melebih-lebihkan **+1,12%**.
- Data belum memuat matriks KDB/KLB/KDH dan belum ada RDTR — keduanya harus
  diinput dari Perda RTRW.
- Sumber data: Pemerintah Kabupaten Banjarnegara melalui SIMTARU. Rujukan
  klasifikasi mengikuti Permen ATR/BPN No. 1 Tahun 2020.

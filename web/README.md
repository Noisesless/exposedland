# Viewer Tata Ruang Kabupaten Banjarnegara

Viewer statis untuk memeriksa hasil konversi data SIMTARU. Tanpa build step,
tanpa dependency online kecuali tile peta OpenStreetMap.

## Menjalankan

```powershell
cd I:\tataruang
.\serve.ps1
```

Lalu buka URL yang dicetak, misalnya `http://127.0.0.1:8008/web/`.

Harus lewat server. Membuka `index.html` langsung dari Explorer akan gagal
karena browser memblokir `fetch()` pada protokol `file://`.

## Menguji

```powershell
cd I:\tataruang
node tools\uji_viewer.js
```

Menjalankan Chrome headless, lalu menelusuri kabupaten → kecamatan → desa →
kembali, sambil memeriksa berkas geojson yang benar-benar diminta, isi legenda,
luas hasil klip, dan ada tidaknya piksel berwarna di kanvas. Butuh
`puppeteer-core` (sudah terpasang di `tools/node_modules`) dan Chrome di lokasi
standar. Port uji bisa diganti: `$env:PORT=8011`.

## Fitur

- **Tampilan awal seluruh kabupaten** — pola ruang 13 kelas sudah terlihat sejak
  dibuka (2,3 MB hasil dissolve), bukan peta kosong.
- **Pemilih wilayah** — 20 kecamatan lewat menu atau klik langsung pada peta.
  Setiap pergantian memuat 4 layer kecamatan itu saja (0,2–3,6 MB), bukan 37 MB.
- **Tiga tingkat tampilan** — kabupaten → kecamatan → desa. Memilih desa memuat
  satu folder desa (~45 KB), bukan seluruh kecamatan.
- **Dua mode tampilan** — Pola Ruang (13 kelas) dan Rawan Bencana (3 kategori,
  diturunkan dari atribut `KRB_03`).
- **Popup atribut** — kelas, kode klasifikasi, luas geodesik, status LP2B,
  KKOP, kawasan strategis, dan rujukan hukum (`REMARK`).
- **Legenda interaktif** — luas per kelas untuk wilayah terpilih; klik baris
  untuk menyembunyikan kelas itu dari peta.
- **Lapisan tambahan** — batas desa, jaringan jalan, sungai.
- **Responsif** — di layar < 860 px panel menjadi bottom sheet dengan tombol
  "Panel".

## Struktur

```
web/
├── index.html
├── style.css
├── app.js
├── vendor/
│   ├── leaflet.js     # 1.9.4, disimpan lokal agar tidak bergantung CDN
│   └── leaflet.css
└── preview.png        # tangkapan layar
```

Data dibaca relatif dari `../geojson/`:

| Berkas | Dipakai untuk |
|---|---|
| `index/batas_kecamatan.geojson` | garis wilayah, klik untuk memilih kecamatan |
| `index/kab_pola_ruang.geojson` | pola ruang seluruh kabupaten (dissolve, 2,3 MB) |
| `index/kab_krb.geojson` | rawan bencana seluruh kabupaten (0,6 MB) |
| `index/daftar_kecamatan.json` | daftar menu, bbox, path layer |
| `index/daftar_desa.json` | daftar 278 desa untuk pemilih desa |
| `index/ringkasan.json` | angka legenda tanpa perlu unduh geometri |
| `per-kecamatan/<slug>/<layer>.geojson` | data rinci saat kecamatan dipilih |
| `per-desa/<kec>/<desa>/<layer>.geojson` | data rinci saat desa dipilih |

## Tiga tingkat tampilan

| | Kabupaten | Kecamatan | Desa |
|---|---|---|---|
| Pola ruang | 13 kelas hasil dissolve (2,3 MB) | 485–2.158 poligon asli (0,2–3,6 MB) | poligon hasil klip (~45 KB) |
| Popup | tidak ada (`interactive: false`) | ada, per poligon | ada, per poligon |
| Klik wilayah | memilih kecamatan | pilih desa di menu atau klik batasnya | — |
| Legenda | luas seluruh kabupaten | luas kecamatan itu | luas desa itu |
| Sumber legenda | `ringkasan.json` | `ringkasan.json` | dihitung dari geometri yang termuat |

Di tingkat kabupaten poligon batas kecamatan digambar tanpa isian
(`fillOpacity: 0`) dan diletakkan di atas layer warna. Path-nya tetap menerima
klik, jadi memilih kecamatan dengan klik tetap berfungsi tanpa menutupi warna
pola ruang. Saat sebuah kecamatan dipilih, batas dikirim ke belakang agar
popup poligon detail bisa diakses.

Di tingkat desa, **batas desa tetap dimuat dari folder kecamatan**, bukan dari
folder desa. Alasannya: desa tetangga harus tetap terlihat dan bisa diklik.
Desa yang sedang dipilih digambar dengan garis tebal, sisanya putus-putus tanpa
isian. Karena `pola_ruang` tidak punya atribut desa, pemecahan per desa
dilakukan dengan **klip spasial** terhadap batas desa — luas hasil klip cocok
dengan luas batas desa sampai 0,2%.

Semua berkas desa/kecamatan di-cache di memori (`state.cache`), jadi bolak-balik
antara tingkat tidak mengunduh ulang. Permintaan yang sudah basi (pengguna
berpindah wilayah sebelum unduhan selesai) dibuang lewat pengecekan slug.

## Catatan teknis

- Peta memakai `preferCanvas: true`. Dengan SVG, 947 poligon per kecamatan
  membuat interaksi tersendat.
- Tile OSM butuh internet. Tanpa internet, poligon tetap tampil di atas
  latar abu-abu.
- `KODKWS` dipakai sebagai kunci warna karena stabil; `NAMOBJ` dipakai sebagai
  label.
- Pada layer sungai, `NAMOBJ` adalah **nama** sungai dan `REMARK` adalah
  **jenis**-nya — kebalikan dari layer lain.
- Nilai `"Tidak Ada"` dan spasi ganda dari sumber dibersihkan sebelum
  ditampilkan di popup.

## Menambah mode tampilan baru

Tambahkan objek palet (kunci → `{nama, warna}`), lalu fungsi
`gambarMode<X>(fc)` yang mengelompokkan fitur per kunci dan membuat
`L.geoJSON` per kelompok. Daftarkan di `gantiMode()` dan `dataLegenda()`.

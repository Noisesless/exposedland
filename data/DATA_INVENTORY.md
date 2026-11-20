# Inventaris Data SIMTARU Kabupaten Banjarnegara

Hasil pemeriksaan langsung: **21 November 2026**
Sumber: `https://simtaru.banjarnegarakab.go.id/`

## Ringkasan

SIMTARU Banjarnegara adalah aplikasi web (CodeIgniter + OpenLayers) dengan **dua menu**:

| Menu | URL | Status | Isi |
|---|---|---|---|
| TATA RUANG | `/Tata_ruang` | Terbuka | Viewer peta interaktif + 4 layer data mentah |
| ITR | `/Itr` | Perlu login | Sistem permohonan izin tata ruang (form, bukan data spasial) |

Tidak ada REST API, tidak ada WMS/WFS. Data disajikan sebagai **file JSON statis** di `/json/`
yang diunduh utuh oleh browser lalu dikonversi WKT→GeoJSON di sisi klien memakai `wkt.js`.

Direktori `/json/` sendiri **diblokir (403)** — tidak bisa listing. Nama file hanya bisa
diketahui dari kode JavaScript halaman `/Tata_ruang`.

## Data yang berhasil diunduh (100% publik, tanpa autentikasi)

Semua tersimpan di `I:\tataruang\data\`.

| File | Ukuran | Record | Geometri | CRS |
|---|---|---|---|---|
| `rencana_pola_ruang.json` | 63,20 MB | 12.538 | POLYGON Z / MULTIPOLYGON Z | WGS84 (EPSG:4326) |
| `batas_administrasi.json` | 3,78 MB | 278 | POLYGON Z / MULTIPOLYGON Z | UTM 49S (EPSG:32749) |
| `sungai_banjarnegara.json` | 3,30 MB | 3.332 | LINESTRING / MULTILINESTRING | UTM 49S (EPSG:32749) |
| `jaringan_transportasi.json` | 1,78 MB | 262 | LINESTRING Z / MULTILINESTRING Z | WGS84 (EPSG:4326) |

**Total ~72 MB. Peringatan: sistem koordinat campuran — wajib reproyeksi 2 layer UTM 49S.**

## 1. Rencana Pola Ruang (data inti)

12.538 poligon, atribut 27 kolom. Skema mengikuti standar **Permen ATR/BPN 1/2020**
(kode klasifikasi berjenjang ORDE01–04 + KODKWS).

Sebaran luas (total 116.217 ha / 1.162 km²):

| NAMOBJ | Poligon | Luas (ha) | % |
|---|---:|---:|---:|
| Kawasan Hortikultura | 1.622 | 44.383,80 | 38,2% |
| Kawasan Perkebunan | 710 | 17.984,59 | 15,5% |
| Kawasan Hutan Produksi Terbatas | 98 | 15.235,88 | 13,1% |
| Kawasan Tanaman Pangan | 7.476 | 14.561,70 | 12,5% |
| Kawasan Permukiman Perdesaan | 2.226 | 11.346,90 | 9,8% |
| Kawasan Permukiman Perkotaan | 160 | 7.167,05 | 6,2% |
| Kawasan Hutan Lindung | 45 | 2.740,02 | 2,4% |
| Badan Air | 145 | 1.811,10 | 1,6% |
| Kawasan Peruntukan Industri | 26 | 402,24 | 0,3% |
| Kawasan Hutan Produksi Tetap | 16 | 384,54 | 0,3% |
| Cagar Alam | 5 | 113,19 | 0,1% |
| Kawasan Keunikan Batuan dan Fosil | 4 | 50,56 | 0,04% |
| Kawasan Cagar Budaya | 5 | 35,47 | 0,03% |

### Atribut tematik tambahan — ini yang paling bernilai

Pola ruang tidak hanya berisi zonasi, tapi juga **overlay tematik** yang sudah jadi:

- **`KRB_03` — Kawasan Rawan Bencana** (15 kombinasi): Banjir Tinggi (2.623), Gerakan Tanah
  Tinggi (1.591), Letusan Gunung Api KRB I/II/III, dan kombinasi multi-bencana. 4.562 poligon berstatus rawan.
- **`KKOP_1` — Keselamatan Operasi Penerbangan** (K01B–K01G): 2.497 poligon.
- **`KP2B_2` — Kawasan Pertanian Pangan Berkelanjutan**: 5.028 poligon (40% wilayah).
- **`KSMPDN`** — Kawasan Strategis (K09B: 2.005, K09C: 87).
- **`RESAIR`, `PTBGMB`** — resapan air, penyangga.
- `CAGBUD`, `HANKAM`, `KKARST`, `MGRSAT`, `RDBUMI` — semua terisi "Tidak Ada" (kosong).
- **`WADMKC`** — atribusi 20 kecamatan menempel per poligon (sangat membantu filter).
- **`REMARK`** — menyimpan rujukan hukum: SK.6605/MENLHK/2021 (kawasan hutan),
  Kepmendikbud 007/M/2017 (Cagar Budaya Dieng), Kepmen ESDM 2817/2006 (Cagar Alam Geologi Karangsambung).

## 2. Batas Administrasi

278 desa/kelurahan dalam 20 kecamatan — **cocok dengan jumlah resmi** Banjarnegara.
Rincian per kecamatan: Madukara 20, Bawang 18, Punggelan 17, Wanayasa 17, Pejawaran 17,
Banjarmangu 17, Mandiraja 16, Pagentan 16, Kalibening 16, Susukan 15, Sigaluh 15,
Purwanegara 13, Karangkobar 13, Banjarnegara 13, Rakit 11, Wanadadi 11, Pagedongan 9,
Purwarejaklampok 8, Pandanarum 8, Batur 8.

Total luas 114.489,60 ha (1.144,90 km²).

Kolom: `Nama_Desa_`, `Kecamatan`, `Kabupaten`, `WADMPR`, `LUASHA`, `Shape_Leng`, `Shape_Area`, `Sumber`, `Tahun`.
`Sumber`/`Tahun` menunjukkan dua versi batas yang digabung:
- 188 record: Peta RBI ATR/BPN, tahun 2001,2016
- 90 record: Peta RBI Permendagri, tahun 2017

Catatan: `Nama_Desa_` hanya 265 nilai unik untuk 278 record (13 nama desa kembar antar-kecamatan — normal).

## 3. Jaringan Transportasi

262 segmen, total ~1.124 km:

| NAMOBJ | Segmen | Panjang |
|---|---:|---:|
| Jalan Lokal Primer | 89 | 483,0 km |
| Jalan Lokal Sekunder | 157 | 440,4 km |
| Jalan Kolektor Primer | 7 | 84,6 km |
| Jalan Arteri Primer | 7 | 57,8 km |
| Jalur Kereta Api Antarkota | 1 | 48,8 km |
| Jalan Tol | 1 | 9,5 km |

Atribut kaya: `ORDE01`–`ORDE04` (klasifikasi hirarkis), `JNSRSR`, `STSJRN` (status jalan),
`SBDATA` (dasar hukum), `REMARK` (nama ruas).
Rujukan: SK Bupati 620/228/2021, Perda Jateng 16/2019, Kepmen PUPR 430/2022,
studi kelayakan reaktivasi KA Purwokerto–Wonosobo.

## 4. Sungai

3.332 fitur. Perhatikan: nama kolomnya menyesatkan.

| Kolom | Isi sebenarnya |
|---|---|
| `REMARK` | **jenis** — Sungai Satu Garis (3.155), Sungai Musiman (165), Garis Tepi Perairan Alam Lainnya (9) |
| `NAMOBJ` | **nama sungai** — hanya 272 fitur bernama (mis. KALI BLIMBING, K. GUMELEM), 3.060 kosong |
| `NAMOBJ_1` | tipe generik, selalu "Sungai" |

Ini kebalikan dari layer lain (`pola_ruang`, `transportasi`) di mana `NAMOBJ` = kelas objek.

## Kesenjangan & catatan kualitas data

1. **CRS campuran.** `batas_administrasi` + `sungai` memakai UTM 49S; `pola_ruang` +
   `transportasi` memakai WGS84. Harus diseragamkan ke EPSG:4326 (atau 32749) saat build.
2. **Atribut `LUASHA` tidak akurat — sudah dikoreksi.** Awalnya terlihat ada selisih
   1.727 ha (1,5%) antara pola ruang dan batas administrasi. Setelah dihitung ulang
   secara geodesik, ternyata geometrinya **selaras sampai 4,88 ha (0,004%)**; yang salah
   adalah atribut `LUASHA` pada `pola_ruang` (lebih besar +1,12% dari luas sebenarnya).
   Gunakan `luas_ha_geo` pada output konversi, bukan `LUASHA`.
3. **Tidak ada layer RTRW/RDTR resmi terpisah.** Yang tersedia adalah "rencana pola ruang"
   saja. Tidak ada struktur ruang, rencana jalan, rencana kawasan lindung terpisah,
   dan **tidak ada RDTR** (detail per-blok) sama sekali.
4. **Semua geometri ber-Z**, nilainya selalu 0 → aman di-flatten jadi 2D.
5. **Banyak sliver.** 1.722 poligon di bawah 100 m² — sudah dibuang di output konversi
   (totalnya hanya 4,88 ha, jadi aman).
6. **Tidak ada tabel/atribut peraturan zonasi** (KDB, KLB, KDH, ITBX per zona). Ini
   yang biasanya dibutuhkan aplikasi tata ruang — harus diinput manual dari Perda RTRW.
7. **Tidak ada batas kawasan hutan sebagai layer sendiri**, hanya lewat atribut `NAMOBJ`.
8. **`/Itr` tidak berguna untuk data** — murni formulir permohonan ber-login.
9. Beberapa referensi aset memakai `http://` (mixed content) — server sudah usang.

## Yang perlu dicari di tempat lain untuk aplikasi lengkap

- **Perda RTRW Kab. Banjarnegara** — untuk matriks KDB/KLB/KDH per zona.
- **Batas kawasan hutan** — dari KLHK (Inahu/PPKH).
- **RDTR** — bila sudah ada Perda RDTR per kawasan.
- **Batas kecamatan/desa versi BPN** — bila butuh presisi lebih tinggi.
- **Data kependudukan, jalan (BPS), tutupan lahan** — untuk analisis daya dukung.

## Cara mengakses ulang

```
https://simtaru.banjarnegarakab.go.id/json/rencana_pola_ruang.json
https://simtaru.banjarnegarakab.go.id/json/batas_administrasi.json
https://simtaru.banjarnegarakab.go.id/json/sungai_banjarnegara.json
https://simtaru.banjarnegarakab.go.id/json/jaringan_transportasi.json
```

Server menolak TLS handshake default Windows PowerShell — set `SecurityProtocol = Tls12`
dan bypass validasi sertifikat. `HEAD` tidak didukung; pakai `GET` (mendukung `Range`/206).

## Script

- `scripts/inspect.py` — profil struktur JSON
- `scripts/analyze.py` — laporan atribut & luas (output: `data/ANALYSIS_REPORT.txt`)
- `scripts/crs_check.py` — deteksi CRS, bbox, panjang jaringan

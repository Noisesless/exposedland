# Analisis Perda RTRW Kabupaten Banjarnegara

Catatan ini memeriksa Perda Kabupaten Banjarnegara Nomor 6 Tahun 2023 tentang
Rencana Tata Ruang Wilayah Kabupaten Banjarnegara Tahun 2023–2043, lalu
membandingkannya dengan data yang dipakai aplikasi di repo ini.

Sumber: JDIH Banjarnegara, `https://jdih.banjarnegarakab.go.id/peraturan-daerah`
(berkas `produk_hukum/2023/LD 6 (RTRW).pdf`, 252 halaman, teks vektor sehingga
bisa diekstrak tanpa OCR — lihat `scripts/ekstrak_rtrw.py`).

## 1. Identitas dan status hukum

- Nomor 6 Tahun 2023, ditetapkan dan diundangkan 19 Oktober 2023 oleh Pj. Bupati
  Tri Harso Widirahmanto. Jangka waktu 2023–2043 (20 tahun).
- Pasal 104 mencabut Perda Nomor 11 Tahun 2011 tentang RTRW 2011–2031.
  Artinya setiap pekerjaan yang masih merujuk Perda 11/2011 sudah tidak punya
  dasar hukum.
- Lampiran berupa peta skala 1:50.000 (struktur ruang, pola ruang, kawasan
  strategis) dan 6 peta ketentuan khusus. Total 17 lampiran.
- Pasal 103 mengatur masa transisi: izin lama yang tidak sesuai dan belum
  dibangun disesuaikan; yang sudah dibangun dan tidak mungkin disesuaikan dapat
  dibatalkan dengan penggantian yang layak.

## 2. Struktur ruang

Sistem pusat permukiman (Pasal 7–8) memakai tiga tingkat:

| Tingkat | Jumlah | Wilayah |
|---|---|---|
| PKL | 2 | Perkotaan Banjarnegara (Banjarnegara, Madukara, Bawang); Perkotaan Klampok (Purwareja Klampok) |
| PPK | 5 | Batur, Karangkobar, Mandiraja, Punggelan, Wanayasa |
| PPL | 5 | Banjarmangu, Kalibening, Pagentan, Pejawaran, Susukan |

Ruas jalan yang ditetapkan dalam Pasal 11: 7 ruas arteri primer, 7 ruas kolektor
primer, jalan lokal, dan Jalan Tol Pekalongan–Wonosobo.

## 3. Pola ruang (Pasal 25–36)

Kawasan lindung 4.456 ha (3,9%); kawasan budi daya 110.033 ha (96,1%).
Angka di bawah ini yang tertulis di Batang Tubuh, bukan hasil hitung ulang.

| Kelas | Luas (ha) | Pasal |
|---|---|---|
| Badan Air | 1.516 | 25 |
| Hutan Lindung | 2.740 | 26 |
| Cagar Alam | 113 | 27 |
| Keunikan Batuan dan Fosil | 51 | 28 |
| Cagar Budaya | 36 | 29 |
| Hutan Produksi Terbatas | 15.236 | 31 |
| Hutan Produksi Tetap | 384 | 31 |
| Tanaman Pangan (KP2B 13.672 ha) | 14.561 | 32 |
| Hortikultura | 44.382 | 32 |
| Perkebunan | 17.985 | 32 |
| Peruntukan Industri | 402 | 33 |
| Permukiman Perkotaan | 6.567 | 35 |
| Permukiman Perdesaan | 10.516 | 35 |

Dua kelas tidak punya bidang sendiri, jadi tidak akan muncul sebagai poligon:
Kawasan Pariwisata (Pasal 34, 103 lokasi: 44 alam, 10 buatan, 30 budaya, 19 minat
khusus) dan Kawasan Pertahanan dan Keamanan (Pasal 36, Koramil/Posmil per
kecamatan).

Catatan yang layak dipertanyakan: kawasan lindung hanya 3,9% dari wilayah, dan
hutan (lindung + HPT + HP tetap) 18.360 ha atau 16,0%. Jadi beban fungsi lindung
sebenarnya bertumpu pada HPT, bukan pada kawasan lindung.

## 4. Kawasan strategis dan pengendalian

Kawasan strategis kabupaten (Pasal 37–38) ada dua, keduanya dari sudut
kepentingan pertumbuhan ekonomi: Agropolitan Jakabaya (Batur, Karangkobar,
Pejawaran, Wanayasa) dan Sentra Produksi Perikanan Rajapurbawa (Bawang,
Mandiraja, Purwanegara, Rakit, Wanadadi). Pengendaliannya memakai KKPR, RDTR
(belum ada, menunggu Perbup), dan instrumen insentif/disinsentif.

## 5. Uji data aplikasi terhadap perda

`scripts/cek_rtrw.py` membandingkan luas di Batang Tubuh dengan
`geojson/index/kab_pola_ruang.geojson`, lalu memeriksa daftar kecamatan per kelas
terhadap geometri `batas_kecamatan.geojson`.

Hasilnya: **data pola ruang di aplikasi adalah Perda 6/2023**, bukan perda lama.
Tiga belas kelasnya cocok sampai satuan hektare (selisih terbesar 3,59 ha pada
Tanaman Pangan; sisanya pembulatan di bawah 1 ha). Total data 114.484,74 ha
berhadapan dengan jumlah angka perda 114.489 ha.

Lapisan jalan juga cocok: 7 arteri primer dan 7 kolektor primer dengan nama yang
sama seperti Pasal 11, ditambah Jalan Tol Pekalongan–Wonosobo sepanjang 9,52 km
dan jalur kereta Purwokerto–Wonosobo 48,78 km.

### Temuan yang perlu ditindaklanjuti

1. **Luas wilayah data 7% di atas angka resmi.** Geometri kecamatan berjumlah
   114.489,62 ha, sedangkan luas Kabupaten Banjarnegara yang dipakai BPS
   106.970,997 ha. Selisihnya 7.518 ha. Beberapa kecamatan ikut membengkak bila
   dibandingkan angka BPS: Punggelan 113,75 vs 102,84 km², Batur 50,79 vs 47,17,
   Purwareja Klampok 23,69 vs 21,87 (Susukan hanya 53,18 vs 52,64). Angka perda
   mewarisi total yang sama, jadi kekeliruan ini sudah ada sebelum perda. Selama
   belum diselesaikan, luas per kecamatan dari peta jangan dipakai sebagai angka
   resmi.
2. **Hutan Produksi Tetap di Batur 24,59 ha tidak disebut perda.** Pasal 31
   hanya menyebut Kalibening, Mandiraja, Purwanegara, Sigaluh, Wanayasa.
3. **Hutan Lindung di Pejawaran hanya 1,51 ha**, padahal disebut sebagai
   kecamatan hutan lindung. Secara teknis benar, secara praktis tidak berarti;
   hal yang sama terjadi pada HPT Pejawaran (0,46 ha).
4. **Salah tulis di Batang Tubuh:** Pasal 25 menulis angka 1.516 tetapi
   hurufnya "seribu lima ratus tiga belas". Data memakai 1.516,34 ha, jadi yang
   benar angkanya.
5. **Salah tulis di data:** nama ruas "Bts. Kab. Bajarnegara/Banyumas-Klampok"
   (seharusnya Banjarnegara).
6. **Tiga hal di perda belum ada di aplikasi:** KP2B (Lampiran XIII), kawasan
   pariwisata (103 lokasi), dan peta ketentuan khusus (rawan bencana, sempadan,
   resapan air, KKOP). Ketiganya bertipe penunjukan, bukan poligon pola ruang,
   jadi perlu lapisan terpisah kalau ingin dibandingkan.

## 6. Saran

- Tulis sumber legal di aplikasi: "Perda 6/2023, Lampiran IX, skala 1:50.000".
  Tanpa itu, angka di layar mudah disalahartikan sebagai hasil survei.
- Selesaikan dulu selisih luas wilayah. Selama total peta 114.489 ha sementara
  total resmi 106.971 ha, setiap perhitungan luas per kecamatan atau per kelas
  menyimpan galat 7% yang seragam dan sulit dilacak.
- Kalau tujuannya analisis kesesuaian, KP2B lebih berguna daripada Tanaman
  Pangan: 13.672 ha yang dilindungi dari alih fungsi, dengan ketentuan khusus
  sendiri di Pasal 81.

## Catatan metode

- Luas dihitung di UTM 49S dari geometri WGS84; beda dengan perhitungan geodesi
  di bawah 0,05%.
- Kelas pola ruang dipotong per kecamatan lewat irisan bidang; irisan di bawah
  5 ha diabaikan supaya sliver tidak dianggap keberadaan.
- Angka "luas_ha" di `kab_pola_ruang.geojson` adalah angka SIMTARU, bukan hasil
  hitung ulang — dan memang angka itulah yang cocok dengan perda.

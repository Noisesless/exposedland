# Issue Tracker & Known Limitations — Serayu

Dokumen ini mencatat daftar anomali, batasan teknis, isu regulasi, dan perbaikan yang terdokumentasi dalam proyek Serayu.

---

## 1. Daftar Isu Aktif (OPEN)

### ISS-001: Diskrepansi Luas Wilayah Geospasial vs Angka Statistik Resmi BPS
- **Status:** `OPEN` (Karakteristik Regulasi / Inherited Limitation)
- **Komponen:** `geojson/index/batas_kecamatan.geojson`, Perda No. 6/2023
- **Deskripsi:** Total luas poligon hasil digitasi batas administrasi adalah **114.489,62 ha** (dan total pola ruang 114.484,74 ha). Sementara itu, luas resmi Kabupaten Banjarnegara yang dipublikasikan Badan Pusat Statistik (BPS) adalah **106.970,997 ha**. Terdapat selisih **+7.518 ha (+7,0%)**.
- **Penyebab:** Selisih ini diwarisi langsung dari angka Batang Tubuh Perda No. 6 Tahun 2023 yang menjumlahkan 114.489 ha. Pembengkakan terjadi pada kecamatan pegunungan dan batas utara (contoh: Punggelan tercatat 113,75 vs BPS 102,84 km²; Batur tercatat 50,79 vs BPS 47,17 km²).
- **Rekomendasi Operasional:** Selama batas definitif Permendagri belum selesai ditata, luas per kecamatan dari peta tidak boleh disajikan sebagai angka rujukan statistik resmi kabupaten, melainkan luas geodesik komputasi spasial.

### ISS-002: Poligon Hutan Produksi Tetap di Batur Tidak Tercantum pada Batang Tubuh Perda
- **Status:** `OPEN` (Diskrepansi Peta vs Naskah Hukum)
- **Komponen:** `scripts/cek_rtrw.py`, `docs/analisis-rtrw-banjarnegara.md`
- **Deskripsi:** Dalam peta pola ruang terdapat poligon **Kawasan Hutan Produksi Tetap seluas 24,59 ha** yang terletak di Kecamatan Batur. Namun dalam naskah Batang Tubuh Perda 6/2023 Pasal 31 ayat (3), Kecamatan Batur tidak disebutkan sebagai lokasi persebaran Kawasan Hutan Produksi Tetap (hanya menyebut Banjarmangu, Sigaluh, Madukara, Pagentan).
- **Rekomendasi:** Perlu konfirmasi ke Dinas PUPR Kabupaten Banjarnegara untuk verifikasi apakah poligon tersebut merupakan kesalahan plotting peta atau kealpaan penulisan naskah perda.

### ISS-003: Ketiadaan Rencana Detail Tata Ruang (RDTR) Digital Kabupaten
- **Status:** `OPEN` (Keterbatasan Data Sumber)
- **Komponen:** `data/DATA_INVENTORY.md`
- **Deskripsi:** Dataset SIMTARU Banjarnegara saat ini baru menyajikan RTRW skala 1:50.000. Dokumen RDTR (skala 1:5.000) digital resmi belum dipublikasikan secara terbuka untuk 20 kecamatan.
- **Mitigasi:** Pada modul `web/space.html` (Kecamatan Banjarnegara), aturan intensitas (KDB, KLB, KDH, GSB) dan ITBX diintegrasikan dari standar pedoman Permen ATR/BPN No. 1/2020 sebagai jembatan analisis mikro.

### ISS-004: False Positive pada Rumput/Lapangan Terbuka Alun-Alun & Deteksi Bangunan Kompleks/Besar
- **Status:** `OPEN` (Karakteristik Spektral Satelit & Target Penyempurnaan Besok)
- **Komponen:** `tools/kadaster_extractor/detector.py`, `tools/kadaster_extractor/regularizer.py`, `web/kadaster.html`
- **Deskripsi:** Pada inspeksi Alun-Alun Banjarnegara, ditemukan poligon persil persegi panjang palsu (*false positive*) yang muncul di tengah rumput/lapangan hijau terbuka akibat bercak rumput kering/paving terik matahari. Sebaliknya, bangunan beratap kompleks sangat besar (seperti sayap Pendopo Dipayuda / Kantor Bupati) mengalami *under-detection* atau hanya terdeteksi sebagian di tepinya.
- **Penyebab:** Pendekatan segmentasi warna murni (HSV/RGB) belum memperhitungkan indeks tutupan kanopi multi-spektral atau elevasi tinggi bangunan (DSM/nDSM) untuk membedakan bidang tanah lapang datar vs atap berketinggian.
- **Rencana Tindak Lanjut Besok:**
  1. Penambahan filter *Green Lawn Suppression* (analisis rasio tekstur permukaan lapangan rumput vs atap genteng).
  2. Pemanfaatan pre-trained building weights / deep learning segmentation atau data Google Open Buildings V3 sebagai ground-truth rujukan untuk mengeliminasi false positive di lapangan publik.

---

## 2. Riwayat Isu Selesai (RESOLVED) — FIFO Max 10

### ISS-009: Kebocoran Visual Layer di Luar Batas Desa Terpilih (Modul URA SPACE)
- **Status:** `RESOLVED`
- **Gejala:** Saat pengguna memilih salah satu desa/kelurahan, zona pola ruang, jalan, dan sungai di luar kelurahan terpilih masih terlihat membayang di bawah lapisan gelap mask.
- **Penyebab:** Penggunaan *donut polygon masking* dengan latar `#0f172a` tidak menghapus objek di layer Leaflet, sehingga fitur luar tetap dirender.
- **Solusi:** Mengganti mekanisme visual mask dengan **Spatial Dataset Replacement**. Menghasilkan `web/data/desa_clipped_layers.json` (6,18 MB) di mana setiap kelurahan telah dipotong geometrinya secara presisi menggunakan Shapely. Saat desa dipilih, seluruh layer Leaflet dikosongkan (`clearLayers()`) dan diisi hanya dengan data terpotong desa tersebut (Zero layer outside).

### ISS-010: Kartu Kontrol Perencanaan Bertindihan pada Navbar Kiri (Modul URA SPACE)
- **Status:** `RESOLVED`
- **Penyebab:** Flexbox container pada `.drawer-body` mengompresi tinggi `.layer-card` karena ketiadaan `flex-shrink: 0`.
- **Solusi:** Menambahkan `flex-shrink: 0` pada kartu layer dan memberikan batas scroll mandiri (`max-height: 220px; overflow-y: auto`) pada kontainer grid chip desa.

### ISS-011: Ketidaksesuaian Koordinat Fasilitas Publik / Landmark
- **Status:** `RESOLVED`
- **Penyebab:** Plotting awal mengandalkan titik estimasi centroid yang bergeser dari tapak bangunan fisik sebenarnya.
- **Solusi:** Audit dan kalibrasi 12 titik landmark fasilitas publik ke koordinat GPS nyata berdasarkan OpenStreetMap dan SK Bupati No. 620/228 (Alun-Alun, Pendopo, Masjid Agung, RSUD, Bappeda, DPUPR, Stadion, Stasiun SDS, dsb).

### ISS-012: Galat 404 pada Pemuatan Ikon Marker Default Leaflet
- **Status:** `RESOLVED`
- **Penyebab:** 6 entitas bangunan OSM berupa tipe geometri `Point` memicu Leaflet memuat file `marker-icon.png` bawaan yang tidak ada di direktori vendor.
- **Solusi:** Menambahkan handler `pointToLayer` berbasis `L.circleMarker` vektor lingkaran pada layer persil bangunan.

### ISS-013: 1.722 Poligon Sliver Mikroskopis
- **Status:** `RESOLVED`
- **Solusi:** Filter eliminasi `AMBANG_M2 = 100.0` di `scripts/convert.py` memangkas 1.722 poligon pecahan tanpa merusak topologi utama.

### ISS-014: Inflasi Atribut Luas Bawaan (`LUASHA` +1,12%)
- **Status:** `RESOLVED`
- **Solusi:** Penghitungan luas geodesik mandiri `luas_ha_geo` berbasis ellipsoid WGS84 menggantikan atribut bawaan yang tidak akurat.

### ISS-015: Pemblokiran Pemuatan GeoJSON pada Protokol `file://`
- **Status:** `RESOLVED`
- **Solusi:** Penyediaan skrip `serve.ps1` yang otomatis memilih port bebas dan menyajikan berkas via HTTP lokal `127.0.0.1`.

### ISS-016: Kegagalan Akses Ubin Citra Satelit Tunggal
- **Status:** `RESOLVED`
- **Solusi:** Pembuatan modul `web/peta-dasar.js` dengan toleransi 4 galat untuk perpindahan otomatis antara Google Satellite, Esri Imagery, EOX Sentinel-2, dan Esri Street.

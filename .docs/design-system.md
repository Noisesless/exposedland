# Design System & Cartographic Visual DNA — Serayu

Dokumen ini merupakan **Single Source of Truth (SSOT)** visual untuk aplikasi Serayu, memuat token desain UI, palet kartografi regulasi tata ruang (Permen ATR/BPN No. 1 Tahun 2020), pedoman desain URA SPACE (Singapore Style), dan spesifikasi modul 3D.

---

## 1. Visual DNA & Design Tokens

### 1.1 UI Interface Tokens 2D GIS (`web/style.css`)

```css
:root {
  /* Tinta & Tipografi */
  --ink: #1b1d21;             /* Teks primer */
  --ink-2: #52585f;           /* Teks sekunder */
  --ink-3: #8b9198;           /* Teks tersier / label form */

  /* Garis & Batas */
  --line: #d8d6d1;            /* Batas panel & pemisah */
  --line-2: #e6e4df;          /* Garis grid halus */

  /* Bidang & Latar Belakang */
  --surface: #ffffff;         /* Latar panel & kartu */
  --surface-2: #f5f4f1;       /* Latar kontrol tersegmen */
  --page: #eceae6;            /* Latar kanvas aplikasi */

  /* Aksen & Interaksi */
  --accent: #1f5b73;          /* Biru teal signature (Danau/Sungai Serayu) */
  --accent-soft: #e4edf0;     /* Highlight lembut */

  /* Geometri & Ukuran */
  --panel-w: 344px;           /* Lebar sidebar kontrol desktop */
  --radius: 3px;              /* Radius sudut formal kartografis */
  --font: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
}
```

### 1.2 Singapore URA SPACE Design Tokens (`web/space.css`)

```css
:root {
  /* Identitas Korporat Perencanaan URA Style */
  --ura-red: #c8102e;         /* Merah signature URA Singapore */
  --ura-red-hover: #a50d26;   /* State hover interaktif */
  --ura-navy: #0f172a;        /* Slate navy kontras tinggi */
  --ura-navy-light: #1e293b;  /* Latar header panel */
  --ura-surface: #ffffff;     /* Latar kartu & drawer */
  --ura-bg: #f8fafc;          /* Kanvas latar belakang netral */
  --ura-border: #e2e8f0;      /* Garis pembatas halus */
  --ura-border-strong: #cbd5e1;/* Batas kartu aktif */
  --ura-text: #1e293b;        /* Teks utama */
  --ura-muted: #64748b;       /* Teks sekunder/keterangan */
  --ura-accent: #b45309;      /* Emas/amber batas zona administrasi */
  
  /* Dimensi & Geometri */
  --drawer-w: 380px;          /* Lebar panel kontrol kiri */
  --inspector-w: 360px;       /* Lebar kartu inspeksi properti kanan */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
}
```

### 1.3 Cartographic Visual DNA — 13 Kelas Pola Ruang (Permen ATR/BPN 1/2020)

| KODKWS | Nama Pola Ruang | Kode Hex | Karakteristik Visual |
|---|---|---|---|
| `31010000` | Badan Air | `#2f7cb8` | Biru laut jernih |
| `31021000` | Kawasan Hutan Lindung | `#1c5e3a` | Hijau tua pekat |
| `31041100` | Cagar Alam | `#0d3f28` | Hijau lumut sangat gelap |
| `31071100` | Kawasan Keunikan Batuan dan Fosil | `#8a6238` | Cokelat tanah mineral |
| `31080000` | Kawasan Cagar Budaya | `#9c5488` | Ungu magenta historis |
| `32021000` | Kawasan Hutan Produksi Tetap | `#3f7a46` | Hijau daun sedang |
| `32022000` | Kawasan Hutan Produksi Terbatas | `#5f9150` | Hijau sage terang |
| `32041000` | Kawasan Tanaman Pangan | `#e8c93f` | Kuning padi keemasan |
| `32042000` | Kawasan Hortikultura | `#c3d470` | Hijau pucuk muda |
| `32043000` | Kawasan Perkebunan | `#a98ac9` | Lavender violet keperakan |
| `32080000` | Kawasan Peruntukan Industri | `#7b8794` | Abu-abu baja manufaktur |
| `32101000` | Kawasan Permukiman Perkotaan | `#c0392b` | Merah bata perkotaan |
| `32102000` | Kawasan Permukiman Perdesaan | `#e2905f` | Oranye terakota perdesaan |

### 1.4 Palet Kawasan Rawan Bencana (KRB_03)

| Kategori Bencana | Warna Hex | Representasi Risiko |
|---|---|---|
| **Rawan Banjir** | `#2f6fb0` | Biru kobalt bahaya hidrometeorologi |
| **Rawan Gerakan Tanah / Longsor** | `#a55a2d` | Terakota kecokelatan lereng rawan |
| **Rawan Letusan Gunung Api** | `#b3342d` | Merah api bahaya vulkanik Dieng |

---

## 2. Component Token Registry

### 2.1 Panel Kontrol Perencanaan (`.drawer-panel`)
- **Struktur:** Lebar tetap 380 px, z-index 1000, bayangan melayang elegan `0 8px 30px rgba(0,0,0,0.12)`.
- **Header:** Identitas merah URA, subjudul 13 kelurahan (2.625 ha).
- **Body:** Menggunakan `flex-shrink: 0` pada setiap kartu (`.layer-card`) dengan scroll mandiri pada daftar kelurahan agar tidak terjadi saling tindih antar-kartu.

### 2.2 Kartu Inspeksi Properti (`.inspector-card`)
- **Posisi:** Melayang di sisi kanan viewport (360 px).
- **Indikator ITBX:** Membagi ketentuan menjadi 4 tab visual (Diizinkan, Terbatas, Bersyarat, Dilarang) plus parameter intensitas (KDB, KLB, KDH, GSB).

### 2.3 Floating Focus Banner (`.desa-focus-banner`)
- **Posisi:** Melayang di tengah atas kanvas peta (`top: 16px; left: 50%; transform: translateX(-50%)`).
- **Elemen:** Menampilkan nama desa/kelurahan yang sedang difokuskan, total persil, dan tombol satu-klik *"Tampilkan Seluruh Kecamatan"*.

---

## 3. Responsive Breakpoints & Mobile Adaptation

- **Desktop (Primary):** Viewport $\ge 1024\text{ px}$. Drawer kiri dan inspector kanan aktif berdampingan dengan peta di tengah.
- **Laptop / Layar Sedang:** Optimal pada **1366×768 px** (Laptop standard di Indonesia).
- **Tablet / Mobile:** Viewport $< 768\text{ px}$. Drawer berubah menjadi modal collapse yang dapat ditutup untuk keleluasaan navigasi peta sentuh.

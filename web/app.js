'use strict';

const DATA = '../geojson';

/* Palet pola ruang — kunci = KODKWS (Permen ATR/BPN 1/2020) */
const PALET_POLA = {
  '31010000': { nama: 'Badan Air', warna: '#2f7cb8' },
  '31021000': { nama: 'Kawasan Hutan Lindung', warna: '#1c5e3a' },
  '31041100': { nama: 'Cagar Alam', warna: '#0d3f28' },
  '31071100': { nama: 'Kawasan Keunikan Batuan dan Fosil', warna: '#8a6238' },
  '31080000': { nama: 'Kawasan Cagar Budaya', warna: '#9c5488' },
  '32021000': { nama: 'Kawasan Hutan Produksi Tetap', warna: '#3f7a46' },
  '32022000': { nama: 'Kawasan Hutan Produksi Terbatas', warna: '#5f9150' },
  '32041000': { nama: 'Kawasan Tanaman Pangan', warna: '#e8c93f' },
  '32042000': { nama: 'Kawasan Hortikultura', warna: '#c3d470' },
  '32043000': { nama: 'Kawasan Perkebunan', warna: '#a98ac9' },
  '32080000': { nama: 'Kawasan Peruntukan Industri', warna: '#7b8794' },
  '32101000': { nama: 'Kawasan Permukiman Perkotaan', warna: '#c0392b' },
  '32102000': { nama: 'Kawasan Permukiman Perdesaan', warna: '#e2905f' },
};
const WARNA_LAIN = '#9aa0a6';

/* Palet rawan bencana — kategori hasil normalisasi atribut KRB_03 */
const PALET_KRB = {
  banjir: { nama: 'Rawan banjir', warna: '#2f6fb0' },
  gerakan_tanah: { nama: 'Rawan gerakan tanah', warna: '#a55a2d' },
  letusan: { nama: 'Rawan letusan gunung api', warna: '#b3342d' },
};

const KODE_KP2B = 'K02A';
const angka = new Intl.NumberFormat('id-ID');
const angkaDesimal = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const state = {
  daftar: null,
  desaDaftar: null,
  ringkasan: null,
  kec: '',
  desa: null,
  mode: 'pola',
  tampil: { desa: true, jalan: true, sungai: true },
  sembunyi: { pola: new Set(), krb: new Set() },
  cache: new Map(),
  subLayer: [],       // sublapisan pola/krb yang sedang tampil
  lapisanData: {},    // desa / jalan / sungai
  fcKab: { pola: null, krb: null },  // layer ringkas tingkat kabupaten
  fcRinci: null,      // layer rinci: kecamatan atau desa yang sedang dipilih
  sibuk: false,
};

let peta;
let layerIndeks;
let layerKecTerpilih;

/* ------------------------------------------------------------------ */
/* utilitas                                                            */
/* ------------------------------------------------------------------ */

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ha(v) {
  return v === null || v === undefined ? '—' : angkaDesimal.format(v) + ' ha';
}

function namaKec(slug) {
  const k = state.daftar && state.daftar.kecamatan.find(function (x) { return x.slug === slug; });
  return k ? k.nama : slug;
}

function namaDesaAktif() {
  const kec = state.desaDaftar && state.desaDaftar.kecamatan[state.kec];
  const d = kec && kec.desa.find(function (x) { return x.slug === state.desa; });
  return d ? d.nama : state.desa;
}

async function muatJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function setStatus(isi, jenis) {
  const el = document.getElementById('status');
  el.innerHTML = isi;
  el.classList.toggle('is-error', jenis === 'error');
}

function krbKategori(teks) {
  const s = String(teks || '').trim();
  if (!s || s.toLowerCase() === 'tidak ada') return [];
  const l = s.toLowerCase();
  const keluar = [];
  if (l.includes('banjir')) keluar.push('banjir');
  if (l.includes('gerakan tanah')) keluar.push('gerakan_tanah');
  if (l.includes('letusan')) keluar.push('letusan');
  return keluar;
}

/* Teks KRB_03 di sumber panjang & mengandung spasi ganda */
function krbRingkas(teks) {
  const s = String(teks || '').trim();
  if (!s || s.toLowerCase() === 'tidak ada') return null;
  return s.replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------------ */
/* peta                                                                */
/* ------------------------------------------------------------------ */

function siapkanPeta() {
  peta = L.map('peta', {
    /* Satu kanvas untuk semua layer, dengan toleransi klik 3 px.
       Bawaan Leaflet 0, sehingga sebuah garis 1,1 px hanya bisa diklik dalam
       radius 0,55 px dari sumbunya — mustahil ditunjuk dengan mouse. Dengan
       3 px, ruas jalan dan sungai dapat diklik, sementara poligon kecamatan
       tetap dapat diklik di bagian dalamnya karena uji titik-dalam-poligon
       tidak memakai toleransi ini. */
    renderer: L.canvas({ tolerance: 3 }),
    zoomControl: false,
    attributionControl: true,
    minZoom: 8,
    maxZoom: 18,
  });

  /* Peta dasar citra satelit; peta-dasar.js yang memilih penyedia dan
     memindahkannya kalau ubin gagal. Atribusinya masuk ke kontrol attribusi
     Leaflet dengan sendirinya saat layer dipasang. */
  PetaDasar.pasang(peta);

  /* Jalan dan sungai sengaja TIDAK diberi pane sendiri. Pane terpisah
     memang menjaga garis di atas poligon, tetapi kanvas pane itu menelan
     setiap klik yang tidak mengenai garis — akibatnya memilih kecamatan
     dengan klik mati sama sekali. Semua layer karena itu memakai satu
     kanvas, dan urutan gambar diatur naikkanGaris(). */

  L.control.zoom({ position: 'bottomright' }).addTo(peta);
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(peta);
}

function gambarIndeks(geo) {
  layerIndeks = L.geoJSON(geo, {
    style: gayaIndeks,
    onEachFeature: function (f, lyr) {
      const nama = f.properties.kecamatan;
      lyr.bindTooltip(nama, { sticky: true, direction: 'top', opacity: 0.9 });
      lyr.on('click', function () { pilihKecamatan(f.properties.slug); });
      lyr.on('mouseover', function () { lyr.setStyle({ weight: 1.6, color: '#5c666d' }); });
      lyr.on('mouseout', function () { layerIndeks.resetStyle(lyr); });
    },
  }).addTo(peta);

  peta.fitBounds(layerIndeks.getBounds(), { padding: [24, 24] });
}

function gayaIndeks(f) {
  const terpilih = state.kec && f.properties.slug === state.kec;

  if (terpilih) {
    return {
      color: '#16303d', weight: 2.2, opacity: 0.95,
      fillColor: '#ffffff', fillOpacity: 0.04, dashArray: null,
    };
  }

  if (!state.kec) {
    /* Tingkat kabupaten: garis saja. Isian dibuat transparan agar warna pola
       ruang di bawahnya tetap terlihat, tetapi path-nya masih menerima klik
       sehingga memilih kecamatan dengan klik tetap berfungsi. */
    return {
      color: '#5a656c', weight: 0.9, opacity: 0.8,
      fillColor: '#ffffff', fillOpacity: 0, dashArray: '4 3',
    };
  }

  return {
    color: '#98a1a7', weight: 0.7, opacity: 0.7,
    fillColor: '#e9e7e2', fillOpacity: 0.2, dashArray: '3 3',
  };
}

/* ------------------------------------------------------------------ */
/* pemilihan wilayah                                                   */
/* ------------------------------------------------------------------ */

function pilihKecamatan(slug) {
  if (state.kec === slug && state.desa === null) return;
  state.kec = slug;
  state.desa = null;
  terapkanWilayah();
}

function pilihDesa(desaSlug) {
  const baru = desaSlug || null;
  if (state.desa === baru) return;
  state.desa = baru;
  terapkanWilayah();
}

/* Satu titik masuk untuk ketiga tingkat: kabupaten, kecamatan, desa. */
function terapkanWilayah() {
  state.fcRinci = null;
  document.getElementById('pilih-kec').value = state.kec;
  isiPilihanDesa(state.kec);
  document.getElementById('pilih-desa').value = state.desa || '';
  bersihkanLapisanData();
  aturToggleDesa();

  /* tingkat kabupaten */
  if (!state.kec) {
    document.getElementById('peta-judul').innerHTML =
      '<strong>Kabupaten Banjarnegara</strong> · ' +
      state.daftar.jumlah + ' kecamatan · ' +
      angkaDesimal.format(state.ringkasan.total_ha) + ' ha';
    peta.fitBounds(layerIndeks.getBounds(), { padding: [24, 24] });
    gambarAktif();
    gambarGarisKabupaten();
    perbaruiLegenda();
    setStatus('Menampilkan gabungan seluruh kabupaten. Klik wilayah untuk melihat rincian.');
    return;
  }

  const info = state.daftar.kecamatan.find(function (k) { return k.slug === state.kec; });
  if (!info) return;

  const daftarDesa = (state.desaDaftar.kecamatan[state.kec] || {}).desa || [];
  const infoDesa = state.desa
    ? daftarDesa.find(function (d) { return d.slug === state.desa; })
    : null;

  const kotak = infoDesa ? infoDesa.bbox : info.bbox;
  peta.fitBounds([[kotak[1], kotak[0]], [kotak[3], kotak[2]]], { padding: [28, 28] });

  if (infoDesa) {
    document.getElementById('peta-judul').innerHTML =
      '<strong>Desa ' + esc(infoDesa.nama) + '</strong> · Kec. ' + esc(info.nama) + ' · ' +
      angkaDesimal.format(infoDesa.luas_ha) + ' ha';
  } else {
    document.getElementById('peta-judul').innerHTML =
      '<strong>' + esc(info.nama) + '</strong> · ' + info.jumlah_desa + ' desa · ' +
      angkaDesimal.format(info.luas_ha) + ' ha';
  }

  gambarAktif();
  perbaruiLegenda();
  muatLapisanData();
}

function isiPilihanDesa(kecSlug) {
  const sel = document.getElementById('pilih-desa');
  sel.innerHTML = '';

  const pertama = document.createElement('option');
  pertama.value = '';
  pertama.textContent = kecSlug ? 'Seluruh kecamatan' : 'Pilih kecamatan dulu';
  sel.appendChild(pertama);

  const kec = kecSlug && state.desaDaftar
    ? state.desaDaftar.kecamatan[kecSlug]
    : null;

  if (!kec) {
    sel.disabled = true;
    return;
  }

  kec.desa.forEach(function (d) {
    const o = document.createElement('option');
    o.value = d.slug;
    o.textContent = d.nama;
    sel.appendChild(o);
  });
  sel.disabled = false;
}

/* Nama desa dari layer batas desa -> slug yang dipakai folder per-desa. */
function slugDesaDari(props) {
  const mentah = bersihTeks(props.Nama_Desa_) || bersihTeks(props.Nama_Desa) || '';
  const bersih = mentah.replace(/^(desa|kelurahan|kel\.?)\s+/i, '').trim();
  const kec = state.desaDaftar ? state.desaDaftar.kecamatan[state.kec] : null;
  if (kec) {
    const cocok = kec.desa.find(function (d) {
      return d.nama.toLowerCase() === bersih.toLowerCase();
    });
    if (cocok) return cocok.slug;
  }
  return bersih.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function bersihkanLapisanData() {
  state.subLayer.forEach(function (l) { peta.removeLayer(l); });
  state.subLayer = [];
  Object.keys(state.lapisanData).forEach(function (k) {
    peta.removeLayer(state.lapisanData[k]);
    delete state.lapisanData[k];
  });
}

/* base: "per-kecamatan/<kec>" atau "per-desa/<kec>/<desa>" */
async function ambilBerkas(base, nama) {
  const kunci = base + '/' + nama;
  if (!state.cache.has(kunci)) {
    /* simpan promise-nya supaya permintaan ganda tidak mengunduh dua kali;
       kalau gagal, entri dibuang agar percobaan berikutnya benar-benar ulang */
    const p = muatJSON(`${DATA}/${base}/${nama}.geojson`).catch(function (e) {
      state.cache.delete(kunci);
      throw e;
    });
    state.cache.set(kunci, p);
  }
  return state.cache.get(kunci);
}

/* dipakai untuk membatalkan hasil fetch yang sudah tidak relevan */
function cakupanSekarang() {
  return state.desa
    ? 'per-desa/' + state.kec + '/' + state.desa
    : 'per-kecamatan/' + state.kec;
}

/* ------------------------------------------------------------------
 * lapisan garis tingkat kabupaten
 * ------------------------------------------------------------------
 * Dipakai selama belum ada kecamatan dipilih. Berkasnya ikut diunduh saat
 * aplikasi mulai (total 1,1 MB) supaya jalan dan sungai langsung tampil,
 * tidak menunggu pengguna memilih wilayah lebih dulu.
 *
 * Kedua layer ini bisa diklik untuk melihat nama ruasnya. Poligon batas
 * kecamatan tetap menerima klik di area yang tidak kena garis — perilaku itu
 * diuji lewat klik mouse sungguhan di tools/uji_viewer.js, bukan diasumsikan.
 */
function gambarGarisKabupaten() {
  ['jalan', 'sungai'].forEach(function (kunci) {
    if (!state.lapisanData[kunci]) return;
    peta.removeLayer(state.lapisanData[kunci]);
    delete state.lapisanData[kunci];
  });

  if (state.tampil.jalan && state.fcKab.jalan) {
    state.lapisanData.jalan = L.geoJSON(state.fcKab.jalan, {
      style: function (f) {
        const g = gayaJalan(f.properties);
        return {
          color: g.color,
          /* lebih tebal daripada proporsi aslinya supaya masih bisa diklik
             pada zoom kabupaten; 0,66 px praktis tidak tersentuh kursor */
          weight: Math.max(1.1, g.weight * 0.7),
          opacity: 0.8,
          dashArray: g.dashArray,
        };
      },
      onEachFeature: function (f, lyr) {
        lyr.bindPopup(popupJalan(f.properties), { maxWidth: 300 });
      },
    }).addTo(peta);
  }

  if (state.tampil.sungai && state.fcKab.sungai) {
    state.lapisanData.sungai = L.geoJSON(state.fcKab.sungai, {
      style: { color: '#2f7cb8', weight: 1.1, opacity: 0.65 },
      onEachFeature: function (f, lyr) {
        lyr.bindPopup(popupSungai(f.properties), { maxWidth: 300 });
      },
    }).addTo(peta);
  }
}

/* Batas desa baru ada setelah kecamatan dipilih. Toggle-nya dimatikan di
   tingkat kabupaten supaya tidak terkesan berfungsi padahal tidak. */
function aturToggleDesa() {
  const el = document.getElementById('lyr-desa');
  if (!el) return;
  const bisa = !!state.kec;
  el.disabled = !bisa;
  el.closest('.toggle').classList.toggle('is-off', !bisa || !el.checked);
  el.closest('.toggle').title = bisa
    ? ''
    : 'Pilih kecamatan dulu untuk menampilkan batas desa';
}

async function muatLapisanData() {
  const base = cakupanSekarang();
  const kecSlug = state.kec;
  state.sibuk = true;
  /* buang lapisan lama dulu: tanpa ini, menyalakan ulang sebuah toggle
     menumpuk layer kedua di atas yang sudah ada */
  bersihkanLapisanData();
  kunciPeta();

  const tugas = [];

  tugas.push(ambilBerkas(base, 'pola_ruang').then(function (fc) {
    if (cakupanSekarang() !== base) return;
    state.fcRinci = fc;
    gambarAktif();
    perbaruiLegenda();
  }));

  /* batas desa selalu diambil dari folder kecamatan, supaya desa tetangga
     tetap tampil sebagai konteks dan bisa diklik */
  if (state.tampil.desa) {
    tugas.push(ambilBerkas('per-kecamatan/' + kecSlug, 'batas_desa').then(function (fc) {
      if (cakupanSekarang() !== base) return;
      state.lapisanData.desa = L.geoJSON(fc, {
        style: gayaDesa,
        onEachFeature: function (f, lyr) {
          const nm = bersihTeks(f.properties.Nama_Desa_) || bersihTeks(f.properties.Nama_Desa);
          lyr.bindTooltip(nm, { sticky: true, direction: 'top', opacity: 0.9 });
          lyr.on('click', function () { pilihDesa(slugDesaDari(f.properties)); });
        },
      }).addTo(peta);
    }));
  }

  if (state.tampil.jalan) {
    tugas.push(ambilBerkas(base, 'transportasi').then(function (fc) {
      if (cakupanSekarang() !== base) return;
      state.lapisanData.jalan = L.geoJSON(fc, {
        style: function (f) { return gayaJalan(f.properties); },
        onEachFeature: function (f, lyr) { lyr.bindPopup(popupJalan(f.properties), { maxWidth: 300 }); },
      }).addTo(peta);
    }));
  }

  if (state.tampil.sungai) {
    tugas.push(ambilBerkas(base, 'sungai').then(function (fc) {
      if (cakupanSekarang() !== base) return;
      state.lapisanData.sungai = L.geoJSON(fc, {
        style: { color: '#2f7cb8', weight: 1, opacity: 0.7 },
        onEachFeature: function (f, lyr) { lyr.bindPopup(popupSungai(f.properties), { maxWidth: 300 }); },
      }).addTo(peta);
    }));
  }

  await Promise.all(tugas).catch(function (e) {
    setStatus('Gagal memuat data: ' + esc(e.message), 'error');
  });

  if (cakupanSekarang() !== base) return;
  state.sibuk = false;
  kunciPeta();

  const jumlah = state.fcRinci ? state.fcRinci.features.length : 0;
  const spektrum = Object.keys(state.lapisanData).length;
  setStatus(
    '<strong>' + angka.format(jumlah) + '</strong> poligon pola ruang · ' +
    '<strong>' + spektrum + '</strong> lapisan garis/batas dimuat. ' +
    (state.desa ? 'Klik area untuk melihat atribut.' : 'Klik garis desa atau menu desa untuk turun ke desa.')
  );
}

function gayaDesa(f) {
  const terpilih = state.desa && slugDesaDari(f.properties) === state.desa;
  if (terpilih) {
    return { color: '#16303d', weight: 2.2, opacity: 0.95, fillColor: '#ffffff', fillOpacity: 0.04 };
  }
  return { color: '#4a545b', weight: 1.1, opacity: 0.8, fillColor: '#ffffff', fillOpacity: 0, dashArray: '5 3' };
}

function kunciPeta() {
  const c = peta.getContainer();
  c.style.cursor = state.sibuk ? 'progress' : '';
}

/* ------------------------------------------------------------------ */
/* gaya garis                                                          */
/* ------------------------------------------------------------------ */

function gayaJalan(p) {
  const n = String(p.NAMOBJ || '');
  if (n.includes('Tol')) return { color: '#2c2c2c', weight: 3.2, opacity: 0.9 };
  if (n.includes('Arteri')) return { color: '#b3541e', weight: 2.6, opacity: 0.9 };
  if (n.includes('Kolektor')) return { color: '#c2772a', weight: 2, opacity: 0.9 };
  if (n.includes('Kereta')) return { color: '#4a4a4a', weight: 1.8, opacity: 0.8, dashArray: '7 4' };
  return { color: '#8a8f94', weight: 1.2, opacity: 0.85 };
}

/* ------------------------------------------------------------------ */
/* mode tampilan                                                       */
/* ------------------------------------------------------------------ */

function gambarModePola(fc, interaktif) {
  state.subLayer.forEach(function (l) { peta.removeLayer(l); });
  state.subLayer = [];
  if (!fc) return;

  const grup = {};
  fc.features.forEach(function (f) {
    const k = f.properties.KODKWS || 'lain';
    (grup[k] = grup[k] || []).push(f);
  });

  Object.keys(grup).forEach(function (kode) {
    const warna = (PALET_POLA[kode] || {}).warna || WARNA_LAIN;
    const opsi = {
      style: { color: '#2b2b2b', weight: 0.4, opacity: 0.5, fillColor: warna, fillOpacity: 0.78 },
      interactive: interaktif !== false,
    };
    if (interaktif !== false) {
      opsi.onEachFeature = function (f, l) {
        l.bindPopup(popupPola(f.properties), { maxWidth: 320 });
      };
    }
    const lyr = L.geoJSON({ type: 'FeatureCollection', features: grup[kode] }, opsi);
    lyr._kode = kode;
    if (!state.sembunyi.pola.has(kode)) lyr.addTo(peta);
    state.subLayer.push(lyr);
  });
}

/* Layer kabupaten sudah digabung per kategori, jadi kategorinya ada di
   properti `kategori`; layer kecamatan masih per poligon (KRB_03). */
function kategoriDari(props) {
  if (props.kategori) return [props.kategori];
  return krbKategori(props.KRB_03);
}

function gambarModeKRB(fc, interaktif) {
  if (!fc) return;

  const grup = { banjir: [], gerakan_tanah: [], letusan: [] };
  fc.features.forEach(function (f) {
    kategoriDari(f.properties).forEach(function (k) {
      if (grup[k]) grup[k].push(f);
    });
  });

  Object.keys(grup).forEach(function (kode) {
    if (!grup[kode].length) return;
    const warna = PALET_KRB[kode].warna;
    const opsi = {
      style: { color: '#2b2b2b', weight: 0.4, opacity: 0.45, fillColor: warna, fillOpacity: 0.72 },
      interactive: interaktif !== false,
    };
    if (interaktif !== false) {
      opsi.onEachFeature = function (f, l) {
        l.bindPopup(popupPola(f.properties), { maxWidth: 320 });
      };
    }
    const lyr = L.geoJSON({ type: 'FeatureCollection', features: grup[kode] }, opsi);
    lyr._kode = kode;
    if (!state.sembunyi.krb.has(kode)) lyr.addTo(peta);
    state.subLayer.push(lyr);
  });
}

/* Gambar ulang sesuai wilayah aktif + mode aktif. Satu pintu masuk, agar
   tingkat kabupaten dan tingkat kecamatan tidak bisa berbeda perilaku. */
function gambarAktif() {
  state.subLayer.forEach(function (l) { peta.removeLayer(l); });
  state.subLayer = [];

  const adaKec = !!state.kec;

  if (state.mode === 'pola') {
    const fc = adaKec ? state.fcRinci : state.fcKab.pola;
    if (fc) gambarModePola(fc, adaKec);
  } else {
    const fc = adaKec ? state.fcRinci : state.fcKab.krb;
    if (fc) gambarModeKRB(fc, adaKec);
  }

  if (layerIndeks) {
    if (adaKec) {
      layerIndeks.bringToBack();
    } else {
      layerIndeks.bringToFront();
    }
    layerIndeks.setStyle(gayaIndeks);
  }

  naikkanGaris();
}

/* Urutan gambar pada satu kanvas mengikuti urutan pendaftaran layer, dan
   urutan itulah yang menentukan pemenang saat dua layer kena klik yang sama:
   kanvas memilih layer teratas. Mengganti mode menggambar poligon baru, yang
   akan menutupi garis, jadi garis didorong kembali ke atas di sini.
   bringToFront memindahkan layer ke ujung daftar gambar, sehingga urutan
   pemanggilan di bawah ini yang menentukan hasil akhir:
   pola ruang -> batas desa -> jalan -> sungai. */
function naikkanGaris() {
  ['desa', 'jalan', 'sungai'].forEach(function (kunci) {
    const l = state.lapisanData[kunci];
    if (l) l.bringToFront();
  });
}

function gantiMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.segmented button').forEach(function (b) {
    const aktif = b.dataset.mode === mode;
    b.classList.toggle('is-active', aktif);
    b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
  });

  gambarAktif();
  perbaruiLegenda();
}

/* ------------------------------------------------------------------ */
/* legenda                                                             */
/* ------------------------------------------------------------------ */

/* Saat sebuah desa dipilih, luas dihitung langsung dari geometri yang sudah
   dimuat. Data per desa cukup kecil sehingga tidak perlu berkas ringkasan
   terpisah, dan angkanya dijamin sama dengan yang tergambar. */
function legendaDariGeometri() {
  if (!state.fcRinci) return [];
  const kumpul = {};
  state.fcRinci.features.forEach(function (f) {
    const p = f.properties;
    const ha = p.luas_ha_geo || 0;

    if (state.mode === 'pola') {
      const k = p.KODKWS || 'lain';
      const pal = PALET_POLA[k] || {};
      if (!kumpul[k]) {
        kumpul[k] = { kunci: k, nama: pal.nama || p.NAMOBJ, warna: pal.warna || WARNA_LAIN, ha: 0, n: 0 };
      }
      kumpul[k].ha += ha;
      kumpul[k].n += 1;
      return;
    }

    kategoriDari(p).forEach(function (kat) {
      if (!kumpul[kat]) {
        kumpul[kat] = { kunci: kat, nama: PALET_KRB[kat].nama, warna: PALET_KRB[kat].warna, ha: 0, n: 0 };
      }
      kumpul[kat].ha += ha;
      kumpul[kat].n += 1;
    });
  });
  return Object.keys(kumpul).map(function (k) {
    kumpul[k].ha = Math.round(kumpul[k].ha * 100) / 100;
    return kumpul[k];
  }).sort(function (a, b) { return b.ha - a.ha; });
}

function dataLegenda() {
  if (state.desa) return legendaDariGeometri();

  const slug = state.kec;
  const r = state.ringkasan;

  if (state.mode === 'pola') {
    const daftar = slug ? (r.kecamatan[slug] || []) : r.kabupaten;
    return daftar.map(function (k) {
      const pal = PALET_POLA[k.kode] || {};
      return {
        kunci: k.kode,
        nama: pal.nama || k.nama,
        warna: pal.warna || WARNA_LAIN,
        ha: k.ha,
        n: k.n,
      };
    });
  }

  const sumber = slug ? (r.krb_kecamatan[slug] || {}) : r.krb_kabupaten;
  return Object.keys(PALET_KRB)
    .filter(function (k) { return sumber[k]; })
    .map(function (k) {
      return {
        kunci: k,
        nama: PALET_KRB[k].nama,
        warna: PALET_KRB[k].warna,
        ha: sumber[k].ha,
        n: sumber[k].n,
      };
    });
}

function perbaruiLegenda() {
  const data = dataLegenda();
  const warnaMode = state.mode;
  const total = data.reduce(function (a, b) { return a + b.ha; }, 0);

  document.getElementById('judul-legenda').textContent =
    state.mode === 'pola' ? 'Legenda pola ruang' : 'Legenda rawan bencana';
  document.getElementById('legenda-total').textContent =
    angkaDesimal.format(Math.round(total)) + ' ha';

  const cakupan = state.desa
    ? 'Desa ' + esc(namaDesaAktif()) + ', Kec. ' + esc(namaKec(state.kec))
    : state.kec
      ? 'Kecamatan ' + esc(namaKec(state.kec))
      : 'Seluruh kabupaten';
  document.getElementById('legenda-hint').textContent = state.mode === 'pola'
    ? cakupan + '. Klik baris untuk menyembunyikan kelas.'
    : cakupan + '. Kategori digabung dari atribut KRB_03; rincian tingkat ada di popup.';

  const wadah = document.getElementById('legenda');
  wadah.innerHTML = '';

  if (!data.length) {
    wadah.innerHTML = '<p class="legend__hint" style="margin:0">' +
      (state.mode === 'krb'
        ? 'Tidak ada kawasan rawan bencana pada wilayah ini.'
        : 'Data kelas pola ruang belum tersedia untuk wilayah ini.') +
      '</p>';
    return;
  }

  data.forEach(function (d) {
    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'legend__item';
    const sembunyi = state.sembunyi[warnaMode].has(d.kunci);
    if (sembunyi) tombol.classList.add('is-off');

    tombol.innerHTML =
      '<span class="swatch" style="background:' + d.warna + '"></span>' +
      '<span class="legend__name">' + esc(d.nama) + '</span>' +
      '<span class="legend__val">' + angkaDesimal.format(Math.round(d.ha)) + ' ha</span>';

    tombol.title = angka.format(d.n) + ' poligon · ' + angkaDesimal.format(d.ha) + ' ha';
    tombol.addEventListener('click', function () { toggleKelas(warnaMode, d.kunci); });

    wadah.appendChild(tombol);
  });
}

function toggleKelas(mode, kunci) {
  const set = state.sembunyi[mode];
  if (set.has(kunci)) set.delete(kunci); else set.add(kunci);

  state.subLayer.forEach(function (l) {
    if (l._kode !== kunci) return;
    if (set.has(kunci)) {
      if (peta.hasLayer(l)) peta.removeLayer(l);
    } else if (!peta.hasLayer(l)) {
      l.addTo(peta);
    }
  });

  perbaruiLegenda();
}

/* ------------------------------------------------------------------ */
/* popup                                                              */
/* ------------------------------------------------------------------ */

/* Sumber memakai spasi ganda & mengisi "Tidak Ada" sebagai penanda kosong */
function bersihTeks(v) {
  if (v === null || v === undefined) return '';
  const t = String(v).replace(/\s+/g, ' ').trim();
  if (!t || t === '—' || /^tidak ada$/i.test(t) || /^none$/i.test(t)) return '';
  return t;
}

function baris(label, nilai) {
  const teks = bersihTeks(nilai);
  if (!teks) return '';
  return '<tr><th>' + esc(label) + '</th><td>' + esc(teks) + '</td></tr>';
}

function bungkusPopup(judul, kode, isi, catatan) {
  return '<p class="pop__judul">' + esc(judul || '(tanpa nama)') + '</p>' +
    (kode ? '<div class="pop__kode">' + esc(kode) + '</div>' : '') +
    '<table class="pop__tabel">' + isi + '</table>' +
    (catatan ? '<p class="pop__catatan">' + esc(catatan) + '</p>' : '');
}

function popupPola(p) {
  let isi = '';
  isi += baris('Kecamatan', p.kecamatan);
  isi += baris('Luas', ha(p.luas_ha_geo));

  const krb = krbRingkas(p.KRB_03);
  if (krb) isi += baris('Rawan bencana', krb);

  if (String(p.KP2B_2 || '').trim() === KODE_KP2B) {
    isi += baris('LP2B', 'Kawasan pertanian pangan berkelanjutan');
  }
  isi += baris('KKOP', p.KKOP_1);
  isi += baris('Kawasan strategis', p.KSMPDN);

  const catatan = bersihTeks(p.REMARK);
  return bungkusPopup(p.NAMOBJ, 'Kode ' + (p.KODKWS || '—'), isi, catatan);
}

function popupJalan(p) {
  let isi = '';
  isi += baris('Kelas jalan', p.NAMOBJ);
  isi += baris('Panjang', angkaDesimal.format(p.panjang_km_geo || 0) + ' km');
  isi += baris('Status', p.STSJRN);
  isi += baris('Kecamatan', p.kecamatan);
  return bungkusPopup(bersihTeks(p.REMARK) || p.NAMOBJ, 'Jaringan jalan', isi, '');
}

/* NAMOBJ = nama sungai, REMARK = jenis sungai */
function popupSungai(p) {
  let isi = '';
  isi += baris('Jenis', p.REMARK);
  isi += baris('Panjang', angkaDesimal.format(p.panjang_km_geo || 0) + ' km');
  isi += baris('Kecamatan', p.kecamatan);
  return bungkusPopup(bersihTeks(p.NAMOBJ) || 'Sungai tanpa nama', 'Jaringan sungai', isi, '');
}

/* ------------------------------------------------------------------ */
/* kontrol panel                                                       */
/* ------------------------------------------------------------------ */

function pasangKontrol() {
  const pilih = document.getElementById('pilih-kec');
  state.daftar.kecamatan
    .slice()
    .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); })
    .forEach(function (k) {
      const o = document.createElement('option');
      o.value = k.slug;
      o.textContent = k.nama + ' (' + k.jumlah_desa + ' desa)';
      pilih.appendChild(o);
    });
  pilih.addEventListener('change', function () { pilihKecamatan(pilih.value); });

  document.querySelectorAll('.segmented button').forEach(function (b) {
    b.addEventListener('click', function () { gantiMode(b.dataset.mode); });
  });

  const pilihDesaEl = document.getElementById('pilih-desa');
  pilihDesaEl.addEventListener('change', function () { pilihDesa(pilihDesaEl.value); });
  isiPilihanDesa('');

  const pasang = function (id, kunci) {
    const el = document.getElementById(id);
    el.addEventListener('change', function () {
      state.tampil[kunci] = el.checked;
      el.closest('.toggle').classList.toggle('is-off', !el.checked);
      /* di tingkat kabupaten jalan/sungai dilayani layer ringkas yang sudah
         ada di memori; batas desa belum tersedia (lihat aturToggleDesa) */
      if (!state.kec) {
        gambarGarisKabupaten();
        return;
      }
      muatLapisanData();
    });
  };
  pasang('lyr-desa', 'desa');
  pasang('lyr-jalan', 'jalan');
  pasang('lyr-sungai', 'sungai');

  const panel = document.getElementById('panel');
  const tombol = document.getElementById('panel-toggle');
  tombol.addEventListener('click', function () {
    const buka = panel.classList.toggle('is-open');
    tombol.setAttribute('aria-expanded', buka ? 'true' : 'false');
  });
}

/* ------------------------------------------------------------------ */
/* mulai                                                               */
/* ------------------------------------------------------------------ */

async function mulai() {
  try {
    const [indeks, daftar, desaDaftar, ringkasan, kabPola, kabKrb, kabJalan, kabSungai] = await Promise.all([
      muatJSON(`${DATA}/index/batas_kecamatan.geojson`),
      muatJSON(`${DATA}/index/daftar_kecamatan.json`),
      muatJSON(`${DATA}/index/daftar_desa.json`),
      muatJSON(`${DATA}/index/ringkasan.json`),
      muatJSON(`${DATA}/index/kab_pola_ruang.geojson`),
      muatJSON(`${DATA}/index/kab_krb.geojson`),
      muatJSON(`${DATA}/index/kab_transportasi.geojson`),
      muatJSON(`${DATA}/index/kab_sungai.geojson`),
    ]);

    state.daftar = daftar;
    state.desaDaftar = desaDaftar;
    state.ringkasan = ringkasan;
    state.fcKab.pola = kabPola;
    state.fcKab.krb = kabKrb;
    state.fcKab.jalan = kabJalan;
    state.fcKab.sungai = kabSungai;

    siapkanPeta();
    gambarIndeks(indeks);
    pasangKontrol();
    aturToggleDesa();
    /* urutannya penting: pola ruang dulu, baru garis, supaya jalan dan sungai
       di atas isian poligon. Kalau dibalik, garis tertimbun dan tampak hilang. */
    gambarAktif();
    gambarGarisKabupaten();
    perbaruiLegenda();

    setStatus(
      'Menampilkan pola ruang, jalan, dan sungai seluruh kabupaten (' + daftar.jumlah +
      ' kecamatan). Klik wilayah untuk rincian per desa.'
    );
  } catch (e) {
    setStatus(
      'Data gagal dimuat (' + esc(e.message) + '). Bila halaman ini dibuka lewat file://, ' +
      'jalankan <strong>serve.ps1</strong> lalu akses ' +
      esc(location.origin.replace(/^null$/, 'http://127.0.0.1:8008')) + '/web/.',
      'error'
    );
  }
}

mulai();

/* ------------------------------------------------------------------
 * kait pemeriksaan untuk tools/uji_viewer.js
 * ------------------------------------------------------------------
 * Hanya membaca keadaan, tidak mengubah apa pun. Tanpa ini uji harus
 * menebak dari piksel kanvas, yang tidak bisa membedakan "layer kosong"
 * dari "layer tertimbun".
 */
window.serayu = {
  keadaan: function () {
    const n = function (l) { return l ? l.getLayers().length : 0; };
    return {
      kec: state.kec,
      desa: state.desa,
      mode: state.mode,
      lapisan: Object.keys(state.lapisanData),
      jumlah: {
        pola: state.fcRinci ? state.fcRinci.features.length : 0,
        jalan: n(state.lapisanData.jalan),
        sungai: n(state.lapisanData.sungai),
        desa: n(state.lapisanData.desa),
      },
      sumberKabupaten: {
        jalan: state.fcKab.jalan ? state.fcKab.jalan.features.length : 0,
        sungai: state.fcKab.sungai ? state.fcKab.sungai.features.length : 0,
      },
    };
  },
  peta: function () { return peta; },
  /* dipakai uji untuk tahu layer mana yang menang di sebuah titik, tanpa
     menebak dari isi popup */
  lapisanData: function () { return state.lapisanData; },
  indeks: function () { return layerIndeks; },
};

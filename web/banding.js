/*
  Peta pembanding: pola ruang di kiri pembatas, bangunan di kanan.

  Dua peta Leaflet yang ditumpuk, bukan satu peta dengan dua layer. Alasannya
  bukan kerapian: pembatas harus bisa membelah peta pada posisi mana pun, dan
  satu-satunya kotak yang koordinatnya tidak bergerak saat peta digeser atau
  di-zoom adalah wadah petanya sendiri. Memotong kanvas tidak bisa dipakai —
  Leaflet memberi transform skala pada kanvas selama animasi zoom, sehingga
  potongan yang dihitung dari posisi kanvas langsung salah dan tidak pernah
  diperbaiki sampai ada peristiwa lain. Dengan clip-path pada wadah peta,
  potongan cukup dinyatakan dalam persen dan ikut menyesuaikan sendiri.

  Kedua peta disinkronkan pada setiap peristiwa gerak. Layer dibuat
  non-interaktif: halaman ini untuk melihat, bukan memilih, dan tidak ada
  tooltip yang perlu ditangkap.
*/
(function () {
  'use strict';

  const DATA = '../geojson/index';

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

  const WARNA_SEL = '#37414d';
  const WARNA_LUAR = '#b3175f';
  const WARNA_LAIN = '#9aa0a6';

  const state = {
    kiri: null,
    kanan: null,
    belah: 50,          // posisi pembatas, persen lebar wadah
    sorot: false,
    siap: false,
  };

  function muatJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + path);
      return r.json();
    });
  }

  /* ---------- peta ---------- */

  function petaBaru(id, denganKontrol) {
    const peta = L.map(id, {
      zoomControl: denganKontrol,
      minZoom: 8,
      maxZoom: 30,
      /* atribusi dipasang di kaki halaman, bukan sebagai kontrol peta */
      attributionControl: false,
      /* satu kanvas per peta: 13 poligon + 2.470 sel masih ringan, tapi
         dengan SVG itu 2.483 elemen DOM per peta */
      renderer: L.canvas({ padding: 0.15 }),
    }).setView([-7.35, 109.6], 10);

    /* peta dasar dipasang sekali untuk kedua peta oleh pasangDasar() */
    return peta;
  }

  /* Peta kiri memandu, peta kanan mengikuti dan sebaliknya. Tanpa penjaga,
     setView pada peta pasangan akan memicu peristiwa gerak yang memanggil
     balik peta pertama, dan keduanya saling menimpa tanpa henti. */
  function sinkronkan() {
    let sedang = false;

    const ikuti = function (sumber, tujuan) {
      const pindah = function () {
        if (sedang) return;
        sedang = true;
        tujuan.setView(sumber.getCenter(), sumber.getZoom(), { animate: false });
        sedang = false;
      };
      sumber.on('move zoom', pindah);
    };

    ikuti(state.kiri, state.kanan);
    ikuti(state.kanan, state.kiri);
  }

  /* ---------- layer ---------- */

  function gayaPola(buram) {
    return function (f) {
      const p = PALET_POLA[f.properties.KODKWS];
      return {
        color: 'rgba(27, 29, 33, 0.35)',
        weight: 0.6,
        fillColor: p ? p.warna : WARNA_LAIN,
        fillOpacity: buram,
      };
    };
  }

  function gayaBangunan(f) {
    const luar = state.sorot && f.properties.zona_terbangun === false;
    return {
      color: luar ? WARNA_LUAR : 'rgba(255, 255, 255, 0.55)',
      weight: luar ? 1 : 0.5,
      fillColor: luar ? WARNA_LUAR : WARNA_SEL,
      fillOpacity: luar ? 0.95 : 0.8,
    };
  }

  function gambar(pola, bangunan) {
    /* sisi kanan tetap menampilkan pola ruang, tapi pudar. Tanpa itu sel
       bangunan hanya tampak sebagai titik di atas peta dasar, dan yang
       dibandingkan — zona versus bangunan — jadi tidak terbaca. */
    L.geoJSON(pola, { style: gayaPola(0.85), interactive: false }).addTo(state.kiri);
    L.geoJSON(pola, { style: gayaPola(0.3), interactive: false }).addTo(state.kanan);
    state.layerBangunan = L.geoJSON(bangunan, {
      style: gayaBangunan,
      interactive: false,
    }).addTo(state.kanan);
  }

  /* ---------- pembatas ---------- */

  function aturBelah(persen) {
    state.belah = Math.max(0, Math.min(100, persen));

    /* clip-path pada wadah peta kanan; karena wadah itu tidak ikut bergeser
       saat peta digeser, persennya selalu benar tanpa dihitung ulang */
    state.kanan.getContainer().style.clipPath = 'inset(0px 0px 0px ' + state.belah + '%)';

    const el = document.getElementById('pembatas');
    el.style.left = state.belah + '%';
    el.setAttribute('aria-valuenow', Math.round(state.belah));
    el.setAttribute('aria-valuetext', Math.round(state.belah) + ' persen');
    document.getElementById('label-kiri').style.opacity = state.belah < 8 ? '0' : '1';
    document.getElementById('label-kanan').style.opacity = state.belah > 92 ? '0' : '1';
  }

  function pasangPembatas() {
    const el = document.getElementById('pembatas');
    const bungkus = document.querySelector('.peta-bungkus');
    let menyeret = false;

    const dariPeristiwa = function (e) {
      const kotak = bungkus.getBoundingClientRect();
      aturBelah(((e.clientX - kotak.left) / kotak.width) * 100);
    };

    el.addEventListener('pointerdown', function (e) {
      menyeret = true;
      el.classList.add('seret');
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      el.focus();
    });
    el.addEventListener('pointermove', function (e) {
      if (menyeret) dariPeristiwa(e);
    });
    const lepas = function (e) {
      if (!menyeret) return;
      menyeret = false;
      el.classList.remove('seret');
      if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerup', lepas);
    el.addEventListener('pointercancel', lepas);

    el.addEventListener('keydown', function (e) {
      const langkah = e.shiftKey ? 10 : 2;
      let baru = null;
      if (e.key === 'ArrowLeft') baru = state.belah - langkah;
      else if (e.key === 'ArrowRight') baru = state.belah + langkah;
      else if (e.key === 'Home') baru = 0;
      else if (e.key === 'End') baru = 100;
      if (baru === null) return;
      e.preventDefault();
      aturBelah(baru);
    });

    aturBelah(50);
  }

  /* ---------- legenda & ringkasan ---------- */

  function isiLegenda() {
    const ul = document.getElementById('legenda-pola');
    Object.keys(PALET_POLA).forEach(function (kode) {
      const p = PALET_POLA[kode];
      const li = document.createElement('li');
      const i = document.createElement('i');
      i.style.background = p.warna;
      li.appendChild(i);
      li.appendChild(document.createTextNode(p.nama));
      ul.appendChild(li);
    });
  }

  function isiRingkasan(geo) {
    const per = new Map();
    let sel = 0, bangunan = 0, luar = 0;

    geo.features.forEach(function (f) {
      const p = f.properties;
      const nama = p.zona_nama || '(tanpa kelas)';
      const isi = per.get(nama) || { sel: 0, bangunan: 0, luar: 0 };
      isi.sel += 1;
      isi.bangunan += p.jumlah;
      if (p.zona_terbangun === false) isi.luar += 1;
      per.set(nama, isi);
      sel += 1;
      bangunan += p.jumlah;
      if (p.zona_terbangun === false) luar += 1;
    });

    const tbody = document.querySelector('#tabel-zona tbody');
    tbody.innerHTML = '';
    Array.from(per.entries())
      .sort(function (a, b) { return b[1].sel - a[1].sel; })
      .forEach(function (pasangan) {
        const isi = pasangan[1];
        const tr = document.createElement('tr');
        if (isi.luar) tr.className = 'luar';
        const nama = document.createElement('td');
        nama.textContent = pasangan[0];
        nama.title = isi.sel + ' sel, ' + isi.bangunan.toLocaleString('id-ID') + ' bangunan';
        const jumlah = document.createElement('td');
        jumlah.textContent = isi.sel.toLocaleString('id-ID');
        tr.appendChild(nama);
        tr.appendChild(jumlah);
        tbody.appendChild(tr);
      });

    document.getElementById('kaki-ringkas').textContent =
      sel.toLocaleString('id-ID') + ' sel 400 m berisi ' +
      bangunan.toLocaleString('id-ID') + ' bangunan; ' +
      luar.toLocaleString('id-ID') + ' sel di luar zona terbangun.';

    const sorot = document.getElementById('sorot');
    sorot.addEventListener('change', function () {
      state.sorot = sorot.checked;
      if (state.layerBangunan) state.layerBangunan.setStyle(gayaBangunan);
    });
  }

  /* ---------- mulai ---------- */

  /* Keterangan peta dasar ikut berpindah kalau penyedianya berganti, dan
     kalau semuanya gagal halaman mengatakannya di kaki, bukan diam saja. */
  function pasangDasar() {
    const catatan = document.getElementById('atribusi-dasar');
    PetaDasar.pasang([state.kiri, state.kanan], {
      onGanti: function (p) {
        if (catatan) catatan.innerHTML = 'Peta dasar ' + p.ket + '.';
      },
      onHabis: function () {
        if (catatan) catatan.innerHTML = 'Peta dasar gagal dimuat: penyedia ubin tidak terjangkau.';
      },
    });
  }

  function mulai() {
    state.kiri = petaBaru('peta-kiri', true);
    state.kanan = petaBaru('peta-kanan', false);
    pasangDasar();
    sinkronkan();
    isiLegenda();
    pasangPembatas();

    Promise.all([
      muatJSON(DATA + '/kab_pola_ruang.geojson'),
      muatJSON(DATA + '/contoh_bangunan.geojson'),
    ]).then(function (hasil) {
      gambar(hasil[0], hasil[1]);
      isiRingkasan(hasil[1]);

      const kotak = L.geoJSON(hasil[0]).getBounds();
      state.kiri.fitBounds(kotak, { padding: [16, 16] });
      state.kanan.fitBounds(kotak, { padding: [16, 16] });
      state.siap = true;
    }).catch(function (e) {
      const pesan = document.createElement('div');
      pesan.className = 'kartu';
      pesan.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 16px;max-width:340px';
      pesan.innerHTML = '<h2>Data gagal dimuat</h2><p class="kaki">' + e.message +
        '<br>Jalankan halaman ini lewat server lokal (lihat README), bukan dengan membuka berkasnya langsung.</p>';
      document.querySelector('.peta-bungkus').appendChild(pesan);
      console.error(e);
    });
  }

  /* Untuk uji kelapa: tanpa ini uji hanya bisa menebak dari piksel. */
  window.banding = {
    kiri: function () { return state.kiri; },
    kanan: function () { return state.kanan; },
    belah: function () { return state.belah; },
    atur: function (persen) { aturBelah(persen); return state.belah; },
    siap: function () { return state.siap; },
    jumlahBangunan: function () {
      return state.layerBangunan ? state.layerBangunan.getLayers().length : 0;
    },
    bangunan: function () { return state.layerBangunan; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mulai);
  } else {
    mulai();
  }
})();

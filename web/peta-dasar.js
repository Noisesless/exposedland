/* Peta dasar citra satelit, dengan cadangan yang dipindah otomatis.
   Ubin OpenStreetMap diblokir di sebagian jaringan dan CARTO sekarang
   menuntut kunci API, jadi keduanya tidak dipakai. Kalau penyedia pertama
   tidak bisa dihubungi, ubin gagal berulang lalu penyedia berikutnya yang
   dipasang; kalau semuanya gagal, halaman tetap terbuka dengan keterangan,
   bukan peta kosong tanpa penjelasan. */
(function () {
  const URUTAN = [
    {
      kunci: 'esri-citra',
      nama: 'citra Esri',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      native: 18,
      ket: 'Citra &copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
    },
    {
      kunci: 'eox-s2',
      nama: 'Sentinel-2',
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
      native: 14,
      ket: 'Sentinel-2 cloudless &copy; <a href="https://s2maps.eu">EOX</a>',
    },
    {
      kunci: 'esri-jalan',
      nama: 'peta jalan Esri',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      native: 19,
      ket: '&copy; <a href="https://www.esri.com">Esri</a>',
    },
  ];

  /* Berapa ubin gagal sebelum penyedia dianggap tidak terjangkau. Satu-dua
     ubin bisa gagal karena gangguan sesaat; blokir jaringan membuat hampir
     semuanya gagal sekaligus. */
  const BATAS = 4;

  function pasang(daftarPeta, opsi) {
    opsi = opsi || {};
    const semua = Array.isArray(daftarPeta) ? daftarPeta : [daftarPeta];
    let indeks = 0;
    let lapisan = [];
    let gagal = 0;
    let habis = false;

    function lepas() {
      lapisan.forEach(function (x) {
        if (x.peta.hasLayer(x.lapisan)) x.peta.removeLayer(x.lapisan);
      });
      lapisan = [];
    }

    function salah() {
      if (habis) return;
      gagal++;
      if (gagal < BATAS) return;
      gagal = 0;
      if (indeks + 1 < URUTAN.length) {
        pakai(indeks + 1);
        return;
      }
      habis = true;
      if (opsi.onHabis) opsi.onHabis();
    }

    function pakai(i) {
      const p = URUTAN[i];
      indeks = i;
      lepas();
      lapisan = semua.map(function (m) {
        const l = L.tileLayer(p.url, {
          maxZoom: 19,
          maxNativeZoom: p.native,
          crossOrigin: true,
          attribution: p.ket,
        });
        l.on('tileerror', salah);
        return { peta: m, lapisan: l.addTo(m) };
      });
      if (opsi.onGanti) opsi.onGanti(p, i);
    }

    pakai(0);

    return {
      aktif: function () { return URUTAN[indeks]; },
      /* dipakai halaman yang ingin memaksa penyedia tertentu */
      ganti: function (kunci) {
        for (let i = 0; i < URUTAN.length; i++) {
          if (URUTAN[i].kunci === kunci) { gagal = 0; pakai(i); return true; }
        }
        return false;
      },
    };
  }

  window.PetaDasar = { daftar: URUTAN, pasang: pasang };
})();

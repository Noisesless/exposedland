/*
 * Uji ujung-ke-ujung viewer 3 tingkat: kabupaten -> kecamatan -> desa -> balik.
 *
 *   node tools/uji_viewer.js            (default port 8011)
 *   $env:PORT=8009; node tools/uji_viewer.js
 *
 * Yang diperiksa bukan cuma "tidak ada error", tapi juga:
 *  - berkas geojson yang benar-benar diminta (per-kecamatan vs per-desa),
 *  - legenda terisi,
 *  - ada piksel berwarna di kanvas Leaflet (bukti layer benar-benar tergambar).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const AKAR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8011);
const CHROME = process.env.CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TIPE = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = http.createServer(function (req, res) {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(AKAR, url);
  if (!f.startsWith(AKAR)) { res.statusCode = 403; return res.end('forbidden'); }
  try {
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  } catch (_) { /* biar readFile yang melaporkan 404 */ }
  fs.readFile(f, function (e, buf) {
    if (e) { res.statusCode = 404; return res.end('tidak ada: ' + url); }
    res.setHeader('Content-Type', TIPE[path.extname(f).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  });
});

const galat = [];
const galatKonsol = [];
const diminta = [];
function lapor(ok, pesan) {
  console.log((ok ? 'OK   ' : 'GALAT') + '  ' + pesan);
  if (!ok) galat.push(pesan);
}

const resolv = function (r) { return new Promise(function (s) { setTimeout(s, r); }); };

/* "12.345 ha" -> 12345 */
function haDari(teks) {
  const n = String(teks).replace(/[^\d]/g, '');
  return n ? Number(n) : 0;
}

async function tungguSiap(page, batas) {
  // teks status berubah begitu pemuatan selesai: "Menampilkan ..." untuk
  // kabupaten, "... poligon ..." untuk kecamatan/desa, "Gagal" bila gagal.
  await page.waitForFunction(function () {
    const t = (document.getElementById('status') || {}).textContent || '';
    if (t.indexOf('Gagal') !== -1) return true;
    return t.indexOf('Menampilkan') !== -1 || t.indexOf('poligon') !== -1;
  }, { timeout: batas || 45000 });
  await resolv(350); // beri waktu render kanvas
}

async function pilih(page, id, nilai) {
  return page.evaluate(function (id, v) {
    const el = document.getElementById(id);
    const ada = Array.prototype.some.call(el.options, function (o) { return o.value === v; });
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return ada;
  }, id, nilai);
}

async function status(page) {
  return page.evaluate(function () { return document.getElementById('status').textContent.trim(); });
}

async function legenda(page) {
  return page.evaluate(function () {
    const el = document.getElementById('legenda');
    return {
      jumlah: el.children.length,
      hint: document.getElementById('legenda-hint').textContent.trim(),
      judul: document.getElementById('judul-legenda').textContent.trim(),
      total: document.getElementById('legenda-total').textContent.trim(),
    };
  });
}

async function piksel(page, teliti) {
  const langkah = teliti ? 4 : 4 * 7;
  return page.evaluate(function (langkah) {
    const daftar = document.querySelectorAll('.leaflet-pane canvas');
    let n = 0, total = 0;
    for (let i = 0; i < daftar.length; i++) {
      const c = daftar[i];
      if (!c.width || !c.height) continue;
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      total += c.width * c.height;
      for (let p = 3; p < d.length; p += langkah) if (d[p] > 8) n++;
    }
    return { kanvas: daftar.length, berwarna: n, total: total };
  }, langkah);
}

/* Simpan snapshot seluruh kanvas, lalu bandingkan dua snapshot piksel per
   piksel. Ini satu-satunya cara yang jujur membuktikan sebuah layer benar-benar
   tergambar: menghitung piksel "tidak transparan" tidak bisa mendeteksi apa pun
   yang digambar di atas poligon yang sudah opak. */
async function rekam(page, nama) {
  return page.evaluate(function (nama) {
    window.__snap = window.__snap || {};
    window.__snap[nama] = Array.prototype.map.call(
      document.querySelectorAll('.leaflet-pane canvas'),
      function (c) { return c.width ? c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice() : null; }
    );
    return window.__snap[nama].length;
  }, nama);
}

async function beda(page, a, b) {
  return page.evaluate(function (a, b) {
    const A = window.__snap[a], B = window.__snap[b];
    if (!A || !B || A.length !== B.length) return -1;
    let n = 0;
    for (let k = 0; k < A.length; k++) {
      if (!A[k] || !B[k] || A[k].length !== B[k].length) return -1;
      const p = A[k], q = B[k];
      for (let i = 0; i < p.length; i += 4) {
        if (Math.abs(p[i] - q[i]) > 6 ||
            Math.abs(p[i + 1] - q[i + 1]) > 6 ||
            Math.abs(p[i + 2] - q[i + 2]) > 6) n++;
      }
    }
    return n;
  }, a, b);
}

async function keadaan(page) {
  return page.evaluate(function () { return window.serayu.keadaan(); });
}

async function setToggle(page, id, nyala) {
  return page.evaluate(function (id, v) {
    const el = document.getElementById(id);
    el.checked = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.checked;
  }, id, nyala);
}

function potong(teks, n) {
  teks = String(teks == null ? '' : teks);
  return teks.length > n ? teks.slice(0, n) + '…' : teks;
}

/* Mencari titik klik untuk sebuah layer garis/poligon.

   Titiknya bukan tebakan: ia diambil dari koordinat asli fitur, dibulatkan ke
   piksel, lalu diverifikasi ulang bahwa di titik itulah layer tersebut memang
   menang. Verifikasi ini penting karena toleransi klik 3 px membuat sebuah
   titik bisa berada di tepi jangkauan, sehingga pembulatan setengah piksel
   saja sudah mengubah pemenangnya.

   Untuk poligon, verteks tidak dipakai (verteks selalu berada di batas, tempat
   dua poligon bertetangga sama-sama kena); yang dipakai titik tengah kotak
   pembatas, lalu kisi 7x7 bila titik tengahnya jatuh di luar bentuk. */
async function cariTitik(page, kunci, pakaiPopup, kecuali) {
  return page.evaluate(function (kunci, pakaiPopup, kecuali) {
    const m = window.serayu.peta();
    const r = m.options.renderer || m._renderer;
    const grup = kunci === 'kecamatan' ? window.serayu.indeks() : window.serayu.lapisanData()[kunci];
    if (!grup) return null;

    const daftar = [];
    for (let o = r._drawFirst; o; o = o.next) daftar.push(o.layer);
    const ukuran = m.getSize();
    const manis = function (l) {
      const pop = l.getPopup && l.getPopup();
      if (!pop) return '';
      return String(pop.getContent()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    };
    const menangDi = function (l, x, y) {
      /* titik yang sama persis dengan yang nanti dikirim mouse.click */
      const lp = m.containerPointToLayerPoint(L.point(x, y));
      let pemenang = null;
      for (let k = 0; k < daftar.length; k++) {
        if (daftar[k].options.interactive && daftar[k]._containsPoint(lp)) pemenang = daftar[k];
      }
      return pemenang === l;
    };
    const layak = function (x, y) {
      return x >= 10 && y >= 10 && x <= ukuran.x - 10 && y <= ukuran.y - 10;
    };
    const calonPoligon = function (l) {
      const bb = l.getBounds();
      const calon = [bb.getCenter()];
      for (let j = 0; j <= 6; j++) {
        for (let k = 0; k <= 6; k++) {
          calon.push(L.latLng(
            bb.getSouth() + (bb.getNorth() - bb.getSouth()) * (j / 6),
            bb.getWest() + (bb.getEast() - bb.getWest()) * (k / 6)));
        }
      }
      return calon;
    };

    const punya = grup.getLayers();
    for (let i = 0; i < punya.length; i++) {
      const l = punya[i];
      if (!!(l.getPopup && l.getPopup()) !== !!pakaiPopup) continue;
      /* biarkan satu kecamatan tetap belum tersentuh, supaya uji berikutnya
         masih bisa memeriksa bahwa berkasnya benar-benar diunduh saat dipilih */
      if (kecuali && l.feature && l.feature.properties
          && l.feature.properties.slug === kecuali) continue;
      const jalur = l.getLatLngs && l.getLatLngs();
      if (!jalur) continue;
      let calon;
      if (l instanceof L.Polygon) {
        calon = calonPoligon(l);
      } else {
        calon = [];
        (function ratakan(a) {
          a.forEach(function (x) { if (Array.isArray(x)) ratakan(x); else calon.push(x); });
        })(jalur);
      }
      for (let j = 0; j < calon.length; j++) {
        const cp = m.latLngToContainerPoint(calon[j]);
        const x = Math.round(cp.x), y = Math.round(cp.y);
        if (!layak(x, y)) continue;
        if (!menangDi(l, x, y)) continue;
        return { x: x, y: y, judul: manis(l) };
      }
    }
    return null;
  }, kunci, pakaiPopup, kecuali || null);
}

async function klikTitik(page, titik) {
  const kotak = await page.evaluate(function () {
    const rc = window.serayu.peta().getContainer().getBoundingClientRect();
    return { left: rc.left, top: rc.top };
  });
  await page.mouse.click(kotak.left + titik.x, kotak.top + titik.y);
  await resolv(900);
}

async function popupTeks(page) {
  return page.evaluate(function () {
    const el = document.querySelector('.leaflet-popup-content');
    return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  });
}

async function tutupPopup(page) {
  await page.evaluate(function () { window.serayu.peta().closePopup(); });
  await resolv(250);
}

async function jalan() {
  await new Promise(function (s) { server.listen(PORT, '127.0.0.1', s); });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  page.on('console', function (m) { if (m.type() === 'error') galatKonsol.push(m.text()); });
  page.on('pageerror', function (e) { galatKonsol.push('pageerror: ' + e.message); });
  page.on('requestfailed', function (r) {
    if (r.url().indexOf('127.0.0.1') !== -1) galatKonsol.push('requestfailed: ' + r.url());
  });
  page.on('request', function (r) {
    const u = r.url();
    if (u.indexOf('.geojson') === -1 && u.indexOf('.json') === -1) return;
    diminta.push(u.replace('http://127.0.0.1:' + PORT + '/geojson/', ''));
  });

  const alamat = 'http://127.0.0.1:' + PORT + '/web/';

  // ---------- 1. kabupaten ----------
  diminta.length = 0;
  await page.goto(alamat, { waitUntil: 'domcontentloaded' });
  await tungguSiap(page);
  let s = await status(page);
  let l = await legenda(page);
  let p = await piksel(page);
  lapor(s.indexOf('Menampilkan') !== -1, 'kabupaten: status terisi -> ' + s.split('.')[0].trim());
  lapor(l.jumlah >= 10, 'kabupaten: legenda ' + l.jumlah + ' kelas, judul "' + l.judul + '"');
  lapor(p.berwarna > 500, 'kabupaten: kanvas tergambar (' + p.berwarna + ' piksel berwarna)');
  lapor(diminta.some(function (d) { return d.indexOf('index/kab_pola_ruang.geojson') !== -1; }),
    'kabupaten: memakai layer ringkas index/kab_pola_ruang.geojson');
  lapor(diminta.some(function (d) { return d.indexOf('index/daftar_desa.geojson') !== -1 || d.indexOf('index/daftar_desa.json') !== -1; }),
    'kabupaten: daftar_desa.json dimuat');
  const haKab = haDari(l.total);
  const jmlKab = l.jumlah;

  // ---------- 1b. garis sudah tampil di tingkat kabupaten ----------
  lapor(diminta.some(function (d) { return d === 'index/kab_transportasi.geojson'; }),
    'kabupaten: jaringan jalan dimuat saat mulai');
  lapor(diminta.some(function (d) { return d === 'index/kab_sungai.geojson'; }),
    'kabupaten: jaringan sungai dimuat saat mulai');

  const awal = await keadaan(page);
  lapor(awal.jumlah.jalan === 262 && awal.jumlah.sungai > 3300,
    'kabupaten: layer garis terpasang (' + awal.jumlah.jalan + ' ruas jalan, ' +
    awal.jumlah.sungai + ' ruas sungai)');
  lapor(awal.lapisan.indexOf('jalan') !== -1 && awal.lapisan.indexOf('sungai') !== -1,
    'kabupaten: lapisan aktif -> ' + awal.lapisan.join(', '));

  const desaTerkunci = await page.evaluate(function () {
    return document.getElementById('lyr-desa').disabled;
  });
  lapor(desaTerkunci, 'kabupaten: toggle batas desa dinonaktifkan (belum ada data desa)');

  /* Yang diuji: layer jalan/sungai benar-benar tergambar dan benar-benar hilang
     saat dimatikan. Perbandingan dilakukan terhadap keadaan "mati", bukan
     terhadap raster awal — memasang ulang layer yang sama selalu menghasilkan
     antialiasing yang sedikit berbeda (terukur ±56.000 piksel tepi, selisih
     5-10 satuan warna, tidak terlihat). Membandingkan raster awal akan
     menguji hal yang salah dan gagal secara palsu. */
  await rekam(page, 'awal');
  await setToggle(page, 'lyr-jalan', false);
  await resolv(900);
  await rekam(page, 'tanpaJalan');
  const dJalanMati = await beda(page, 'awal', 'tanpaJalan');
  lapor(dJalanMati > 500, 'kabupaten: jalan benar-benar tergambar (' +
    dJalanMati + ' piksel berubah saat dimatikan)');

  await setToggle(page, 'lyr-jalan', true);
  await resolv(900);
  await rekam(page, 'pulihJalan');
  const dJalanHidup = await beda(page, 'tanpaJalan', 'pulihJalan');
  lapor(dJalanHidup > 500, 'kabupaten: jalan kembali setelah dinyalakan (' +
    dJalanHidup + ' piksel berubah)');
  const setelahJalan = await keadaan(page);
  lapor(setelahJalan.jumlah.jalan === 262 && setelahJalan.lapisan.length === 2,
    'kabupaten: jumlah layer setelah toggle tidak menumpuk (' +
    setelahJalan.jumlah.jalan + ' ruas, lapisan: ' + setelahJalan.lapisan.join(', ') + ')');

  await setToggle(page, 'lyr-sungai', false);
  await resolv(900);
  await rekam(page, 'tanpaSungai');
  const dSungaiMati = await beda(page, 'pulihJalan', 'tanpaSungai');
  lapor(dSungaiMati > 500, 'kabupaten: sungai benar-benar tergambar (' +
    dSungaiMati + ' piksel berubah saat dimatikan)');

  await setToggle(page, 'lyr-sungai', true);
  await resolv(900);
  await rekam(page, 'pulihSungai');
  const dSungaiHidup = await beda(page, 'tanpaSungai', 'pulihSungai');
  lapor(dSungaiHidup > 500, 'kabupaten: sungai kembali setelah dinyalakan (' +
    dSungaiHidup + ' piksel berubah)');

  const akhirKab = await keadaan(page);
  lapor(akhirKab.jumlah.jalan === 262 && akhirKab.jumlah.sungai > 3300,
    'kabupaten: kedua layer utuh setelah empat kali toggle');

  /* Garis harus tetap di atas poligon walau mode tampilan diganti, sebab
     mengganti mode mendaftarkan poligon baru yang kalau tidak punya pane
     sendiri akan menutupi jalan dan sungai. */
  await rekam(page, 'sebelumKRB');
  await page.evaluate(function () { document.querySelector('[data-mode="krb"]').click(); });
  await resolv(1400);
  await rekam(page, 'krb');
  const dKRB = await beda(page, 'sebelumKRB', 'krb');
  lapor(dKRB > 1000, 'kabupaten: mode KRB mengubah gambar (' + dKRB + ' piksel)');

  const krbKeadaan = await keadaan(page);
  lapor(krbKeadaan.mode === 'krb' && krbKeadaan.jumlah.jalan === 262,
    'kabupaten: garis tidak ikut hilang saat mode KRB (' + krbKeadaan.jumlah.jalan + ' ruas jalan)');

  await page.evaluate(function () { document.querySelector('[data-mode="pola"]').click(); });
  await resolv(1400);

  // ---------- 1c. ruas jalan dan sungai bisa diklik ----------
  const titikJalan = await cariTitik(page, 'jalan', true);
  lapor(!!titikJalan, 'klik kabupaten: ada titik uji di ruas jalan' +
    (titikJalan ? ' (' + potong(titikJalan.judul, 40) + ')' : ''));
  if (titikJalan) {
    await klikTitik(page, titikJalan);
    const teks = await popupTeks(page);
    lapor(!!teks && teks.indexOf(titikJalan.judul) === 0,
      'klik kabupaten: popup ruas jalan -> "' + potong(teks, 80) + '"');
    lapor(!!teks && teks.indexOf('Jaringan jalan') !== -1 && /km/.test(teks),
      'klik kabupaten: popup jalan memuat kelas/panjang');
    await tutupPopup(page);
  }

  const titikSungai = await cariTitik(page, 'sungai', true);
  lapor(!!titikSungai, 'klik kabupaten: ada titik uji di ruas sungai' +
    (titikSungai ? ' (' + potong(titikSungai.judul, 40) + ')' : ''));
  if (titikSungai) {
    await klikTitik(page, titikSungai);
    const teks = await popupTeks(page);
    lapor(!!teks && teks.indexOf(titikSungai.judul) === 0,
      'klik kabupaten: popup ruas sungai -> "' + potong(teks, 80) + '"');
    lapor(!!teks && teks.indexOf('Jaringan sungai') !== -1,
      'klik kabupaten: popup sungai menyebut jenisnya');
    await tutupPopup(page);
  }

  /* Klik di tengah wilayah harus tetap memilih kecamatan: garis memang menang
     bila ditunjuk tepat, tapi tidak boleh mendominasi seluruh peta. Kecamatan
     yang dipakai uji berikutnya sengaja dilewati agar berkasnya belum termuat. */
  const kecCadangan = await page.evaluate(function () {
    const el = document.getElementById('pilih-kec');
    return el.options[1] ? el.options[1].value : null;
  });
  const titikKec = await cariTitik(page, 'kecamatan', false, kecCadangan);
  lapor(!!titikKec, 'klik kabupaten: ada titik uji di dalam wilayah kecamatan');
  if (titikKec) {
    const sebelum = await keadaan(page);
    lapor(sebelum.kec === '', 'klik kabupaten: mulai dari keadaan tanpa kecamatan');
    await klikTitik(page, titikKec);
    const pilihan = await page.evaluate(function () {
      return { kec: window.serayu.keadaan().kec, nilai: document.getElementById('pilih-kec').value };
    });
    lapor(!!pilihan.kec && pilihan.kec === pilihan.nilai && pilihan.kec !== kecCadangan,
      'klik kabupaten: klik wilayah memilih kecamatan -> ' + JSON.stringify(pilihan));
    lapor((await popupTeks(page)) === null, 'klik kabupaten: wilayah tidak membuka popup garis');
    await pilih(page, 'pilih-kec', '');
    await tungguSiap(page);
  }

  // ---------- 2. kecamatan ----------
  const kec = await page.evaluate(function () {
    const el = document.getElementById('pilih-kec');
    return el.options[1] ? el.options[1].value : null;
  });
  lapor(!!kec, 'ada pilihan kecamatan (' + kec + ')');

  diminta.length = 0;
  await pilih(page, 'pilih-kec', kec);
  await tungguSiap(page);
  s = await status(page);
  l = await legenda(page);
  p = await piksel(page);
  const desaAktif = await page.evaluate(function () { return !document.getElementById('pilih-desa').disabled; });
  const opsiDesa = await page.evaluate(function () {
    return Array.prototype.map.call(document.getElementById('pilih-desa').options, function (o) { return o.value; });
  });
  lapor(diminta.some(function (d) { return d === 'per-kecamatan/' + kec + '/pola_ruang.geojson'; }),
    'kecamatan: memuat per-kecamatan/' + kec + '/pola_ruang.geojson');
  lapor(diminta.some(function (d) { return d === 'per-kecamatan/' + kec + '/batas_desa.geojson'; }),
    'kecamatan: batas desa dimuat sebagai konteks');
  lapor(l.jumlah > 0, 'kecamatan: legenda ' + l.jumlah + ' kelas');
  lapor(l.hint.indexOf('Kecamatan') !== -1, 'kecamatan: hint legenda -> "' + l.hint + '"');
  lapor(p.berwarna > 500, 'kecamatan: kanvas tergambar (' + p.berwarna + ' piksel)');
  lapor(desaAktif, 'kecamatan: pemilih desa aktif');
  lapor(opsiDesa.length > 1, 'kecamatan: ' + (opsiDesa.length - 1) + ' desa terdaftar di pemilih');
  const haKec = haDari(l.total);
  const jmlKec = l.jumlah;

  // ---------- 2b. klik di tingkat kecamatan ----------
  for (const [kunci, penanda] of [['jalan', 'Jaringan jalan'], ['sungai', 'Jaringan sungai']]) {
    const titik = await cariTitik(page, kunci, true);
    lapor(!!titik, 'klik kecamatan: ada titik uji di ruas ' + kunci +
      (titik ? ' (' + potong(titik.judul, 40) + ')' : ''));
    if (!titik) continue;
    await klikTitik(page, titik);
    const teks = await popupTeks(page);
    lapor(!!teks && teks.indexOf(titik.judul) === 0 && teks.indexOf(penanda) !== -1,
      'klik kecamatan: popup ' + kunci + ' -> "' + potong(teks, 80) + '"');
    await tutupPopup(page);
  }

  /* Batas desa harus tetap di atas pola ruang dan tetap bisa diklik; kalau
     urutan gambar salah, poligon pola ruanglah yang menerima klik. */
  const titikDesa = await cariTitik(page, 'desa', false);
  lapor(!!titikDesa, 'klik kecamatan: ada titik uji di dalam poligon desa');
  if (titikDesa) {
    await klikTitik(page, titikDesa);
    const dipilih = await page.evaluate(function () {
      return { desa: window.serayu.keadaan().desa, nilai: document.getElementById('pilih-desa').value };
    });
    lapor(!!dipilih.desa && dipilih.desa === dipilih.nilai,
      'klik kecamatan: klik poligon desa memilih desa -> ' + JSON.stringify(dipilih));
    lapor((await popupTeks(page)) === null, 'klik kecamatan: poligon desa tidak membuka popup');
    await pilih(page, 'pilih-desa', '');
    await tungguSiap(page);
  }

  // ---------- 3. desa ----------
  const desa = opsiDesa[1];
  diminta.length = 0;
  await pilih(page, 'pilih-desa', desa);
  await tungguSiap(page);
  s = await status(page);
  l = await legenda(page);
  p = await piksel(page);
  lapor(diminta.some(function (d) { return d === 'per-desa/' + kec + '/' + desa + '/pola_ruang.geojson'; }),
    'desa: memuat per-desa/' + kec + '/' + desa + '/pola_ruang.geojson');
  lapor(l.hint.indexOf('Desa') !== -1, 'desa: hint legenda -> "' + l.hint + '"');
  lapor(l.jumlah > 0, 'desa: legenda ' + l.jumlah + ' kelas (dihitung dari geometri)');
  lapor(p.berwarna > 300, 'desa: kanvas tergambar (' + p.berwarna + ' piksel)');

  /* Uji pemotongan yang sebenarnya: luas pola ruang desa harus jauh lebih
     kecil daripada kecamatan, dan mendekati luas batas desanya sendiri. */
  const haDesa = haDari(l.total);
  lapor(haDesa > 0 && haDesa < haKec * 0.5,
    'desa: luas terpotong ' + l.total + ' vs kecamatan ' + haKec.toLocaleString('id-ID') + ' ha');
  const daftarDesa = JSON.parse(fs.readFileSync(path.join(AKAR, 'geojson', 'index', 'daftar_desa.json'), 'utf8'));
  const info = (daftarDesa.kecamatan[kec] || { desa: [] }).desa
    .find(function (d) { return d.slug === desa; });
  if (info) {
    const selisih = Math.abs(haDesa - info.luas_ha) / info.luas_ha;
    lapor(selisih < 0.2, 'desa: ' + info.nama + ' ' + haDesa.toLocaleString('id-ID') +
      ' ha vs batas desa ' + info.luas_ha.toLocaleString('id-ID') + ' ha (selisih ' +
      (selisih * 100).toFixed(1) + '%)');
  }

  /* Desa memakai jalur kode yang sama dengan kecamatan (muatLapisanData),
     tetapi berkasnya dipotong per desa — jadi ruas yang bisa diklik di sini
     membuktikan potongan itu tidak memutus geometri garisnya. */
  for (const [kunci, penanda] of [['jalan', 'Jaringan jalan'], ['sungai', 'Jaringan sungai']]) {
    const titik = await cariTitik(page, kunci, true);
    lapor(!!titik, 'klik desa: ada titik uji di ruas ' + kunci +
      (titik ? ' (' + potong(titik.judul, 40) + ')' : ''));
    if (!titik) continue;
    await klikTitik(page, titik);
    const teks = await popupTeks(page);
    lapor(!!teks && teks.indexOf(titik.judul) === 0 && teks.indexOf(penanda) !== -1,
      'klik desa: popup ' + kunci + ' -> "' + potong(teks, 80) + '"');
    await tutupPopup(page);
  }

  // ---------- 4. balik ke kecamatan ----------
  /* Berkasnya sudah di cache, jadi tidak ada permintaan jaringan baru —
     yang diperiksa di sini adalah keadaannya benar-benar kembali ke luas
     dan jumlah kelas tingkat kecamatan. */
  diminta.length = 0;
  await pilih(page, 'pilih-desa', '');
  await tungguSiap(page);
  l = await legenda(page);
  lapor(l.hint.indexOf('Kecamatan') !== -1, 'balik ke kecamatan: hint kembali ke kecamatan');
  lapor(l.jumlah === jmlKec, 'balik ke kecamatan: legenda kembali ' + l.jumlah + ' kelas');
  lapor(Math.abs(haKec - haDari(l.total)) < 2, 'balik ke kecamatan: luas kembali ' + l.total +
    ' (sebelumnya ' + haKec.toLocaleString('id-ID') + ' ha)');

  // ---------- 5. balik ke kabupaten ----------
  diminta.length = 0;
  await pilih(page, 'pilih-kec', '');
  await tungguSiap(page);
  p = await piksel(page);
  l = await legenda(page);
  const desaNonaktif = await page.evaluate(function () { return document.getElementById('pilih-desa').disabled; });
  lapor(l.jumlah === jmlKab, 'balik ke kabupaten: legenda kembali ' + l.jumlah + ' kelas');
  lapor(Math.abs(haKab - haDari(l.total)) < 2, 'balik ke kabupaten: luas kembali ' + l.total);
  lapor(p.berwarna > 500, 'balik ke kabupaten: kanvas tergambar (' + p.berwarna + ' piksel)');
  lapor(desaNonaktif, 'balik ke kabupaten: pemilih desa dinonaktifkan');

  // ---------- 6. mode rawan bencana ----------
  diminta.length = 0;
  await page.evaluate(function () {
    document.querySelector('[data-mode="krb"]').click();
  });
  await resolv(1800);
  p = await piksel(page);
  l = await legenda(page);
  lapor(l.jumlah > 0 && l.jumlah < 6, 'mode KRB: legenda ' + l.jumlah + ' kategori, total ' + l.total);
  lapor(p.berwarna > 300, 'mode KRB: kanvas tergambar (' + p.berwarna + ' piksel)');

  // ---------- 7. toggle lapisan ----------
  await page.evaluate(function () {
    document.querySelector('[data-mode="pola"]').click();
  });
  await resolv(1200);
  const toggle = await page.evaluate(function () {
    const el = document.getElementById('lyr-sungai');
    el.checked = false;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.checked;
  });
  await resolv(1500);
  lapor(toggle === false, 'toggle sungai: bisa dimatikan tanpa error');

  // ---------- 8. tanpa galat ----------
  lapor(galatKonsol.length === 0,
    galatKonsol.length ? 'galat konsol: ' + galatKonsol.slice(0, 4).join(' | ') : 'tidak ada galat konsol');

  await browser.close();
  server.close();

  console.log('');
  console.log(galat.length ? 'GAGAL: ' + galat.length + ' pemeriksaan' : 'SEMUA PEMERIKSAAN LULUS');
  process.exit(galat.length ? 1 : 0);
}

jalan().catch(async function (e) {
  console.error('UJI BERHENTI: ' + e.message);
  if (galatKonsol.length) console.error('KONSOL:\n  ' + galatKonsol.join('\n  '));
  if (diminta.length) console.error('DIMINTA:\n  ' + diminta.join('\n  '));
  try { server.close(); } catch (_) {}
  process.exit(1);
});

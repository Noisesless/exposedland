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

async function piksel(page) {
  return page.evaluate(function () {
    const daftar = document.querySelectorAll('.leaflet-pane canvas');
    let n = 0, total = 0;
    for (let i = 0; i < daftar.length; i++) {
      const c = daftar[i];
      if (!c.width || !c.height) continue;
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      total += c.width * c.height;
      for (let p = 3; p < d.length; p += 4 * 7) if (d[p] > 8) n++;
    }
    return { kanvas: daftar.length, berwarna: n, total: total };
  });
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

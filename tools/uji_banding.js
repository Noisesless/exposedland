/*
  Uji halaman pembanding.

  Yang diperiksa bukan "halaman terbuka", tapi bahwa pembatas benar-benar
  membelah gambar. Buktinya dari potret layar: satu petak yang sama dipotret
  saat pembatas di 0% (petak itu isinya sisi kanan), di 100% (isinya sisi
  kiri), lalu di 50% (harus sama dengan salah satu). Kalau clip-path tidak
  bekerja, potret 0% dan 100% akan identik.
*/
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');

const AKAR = path.resolve(__dirname, '..');
const PORT = 8031;
const TIPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.geojson': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  let f = path.join(AKAR, decodeURIComponent(req.url.split('?')[0]));
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (_) {}
  fs.readFile(f, (e, b) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', TIPE[path.extname(f).toLowerCase()] || 'application/octet-stream');
    res.end(b);
  });
});

const resolv = ms => new Promise(s => setTimeout(s, ms));
let lulus = 0, gagal = 0;
function lapor(ok, pesan) {
  if (ok) { lulus++; console.log('  OK    ' + pesan); }
  else { gagal++; console.log('  GALAT ' + pesan); }
}

(async () => {
  await new Promise(s => server.listen(PORT, '127.0.0.1', s));
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true, args: ['--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  /* Peta dasar sengaja dimatikan: ubin OSM datang kapan saja, sehingga potret
     layar sebelum dan sesudah bisa berbeda bukan karena pembatas. Dengan ubin
     ditolak, yang tersisa di layar hanya layer yang memang diuji. */
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().indexOf('tile.openstreetmap.org') !== -1) {
      req.respond({ status: 204, contentType: 'image/png', body: '' }).catch(() => {});
      return;
    }
    req.continue().catch(() => {});
  });

  const galat = [];
  page.on('pageerror', e => galat.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    /* peta dasar butuh internet; ketiadaan tile bukan cacat halaman, dan
       favicon memang tidak disediakan */
    if (t.indexOf('tile.openstreetmap.org') !== -1 || t.indexOf('favicon') !== -1) return;
    if (t.indexOf('Failed to load resource') !== -1) return;
    galat.push(t);
  });

  await page.goto('http://127.0.0.1:' + PORT + '/web/banding.html', { waitUntil: 'domcontentloaded' });

  console.log('\n1. halaman dan data');
  let siap = true;
  try {
    await page.waitForFunction(() => window.banding && window.banding.siap(), { timeout: 60000 });
  } catch (e) { siap = false; }
  lapor(siap, 'kedua berkas data termuat dan peta siap');
  lapor(await page.evaluate(() => !!document.getElementById('pembatas')), 'pembatas ada');
  const n = await page.evaluate(() => window.banding.jumlahBangunan());
  lapor(n > 1000, 'layer bangunan terisi: ' + n + ' sel');
  lapor(await page.evaluate(() => {
    const k = window.banding.kanan().getContainer();
    return /inset/.test(k.style.clipPath || '');
  }), 'wadah peta kanan dipotong (clip-path terpasang)');

  const barisZona = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#tabel-zona tbody tr')).map(tr => tr.children[0].textContent));
  lapor(barisZona.length >= 5, 'tabel ringkasan berisi ' + barisZona.length + ' zona: ' + barisZona.slice(0, 3).join(', '));

  console.log('\n2. kedua peta sinkron');
  const sinkron = await page.evaluate(async () => {
    const kiri = window.banding.kiri();
    kiri.setView([-7.25, 109.65], 12, { animate: false });
    await new Promise(s => setTimeout(s, 400));
    const kanan = window.banding.kanan();
    return {
      zoom: [kiri.getZoom(), kanan.getZoom()],
      lat: [kiri.getCenter().lat, kanan.getCenter().lat],
      lng: [kiri.getCenter().lng, kanan.getCenter().lng],
    };
  });
  lapor(sinkron.zoom[0] === sinkron.zoom[1]
    && Math.abs(sinkron.lat[0] - sinkron.lat[1]) < 1e-6
    && Math.abs(sinkron.lng[0] - sinkron.lng[1]) < 1e-6,
    'menggeser peta kiri memindahkan peta kanan: zoom ' + sinkron.zoom[0] + ', ' +
    sinkron.lat[0].toFixed(4) + '/' + sinkron.lng[0].toFixed(4));

  /* Pandangan dikunci ke Banjarnegara kota pada zoom 12: pada zoom seluruh
     kabupaten, satu sel 400 m hanya sepersekian piksel sehingga perbandingan
     potret jadi tidak bermakna. */
  await page.evaluate(() => window.banding.kiri().setView([-7.35, 109.6], 12, { animate: false }));
  await resolv(900);

  console.log('\n3. pembatas membelah gambar');
  const kotak = await page.evaluate(() => {
    const k = document.querySelector('.peta-bungkus').getBoundingClientRect();
    return { left: Math.round(k.left), top: Math.round(k.top), width: Math.round(k.width), height: Math.round(k.height) };
  });
  const petak = (fraksi) => ({
    x: Math.round(kotak.left + kotak.width * fraksi - 90),
    y: Math.round(kotak.top + kotak.height * 0.5 - 70),
    width: 180, height: 140,
  });

  /* Potret penuh, lalu dipotong dan dibandingkan di dalam halaman. Potret
     ber-clip tidak dipakai: hasilnya tidak selalu sama dengan potongan dari
     potret penuh, dan perbedaan itu muncul sebagai kegagalan uji yang
     menyesatkan. */
  const potretPenuh = async () => await page.screenshot({ encoding: 'base64' });

  /* Yang dikembalikan bukan jumlah piksel berbeda, tapi juga selisih warna
     terbesar. Kanvas memang digambar ulang dan hasilnya tidak bit-identik:
     sesudah satu kali setStyle, sebagian piksel bergeser satu tingkat warna
     tanpa ada yang berubah di halaman. Menghitung piksel mentah membuat uji
     gagal karena derau itu, jadi kesamaan dinilai dari selisih terbesarnya. */
  const bedaWilayah = (a, b, k) => page.evaluate(async (a, b, k) => {
    const muat = async (b64) => {
      const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
      const bmp = await createImageBitmap(blob);
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height);
    };
    const A = await muat(a), C = await muat(b);
    let n = 0, maks = 0;
    for (let y = k.y; y < k.y + k.height; y++) {
      for (let x = k.x; x < k.x + k.width; x++) {
        const i = (y * A.width + x) * 4;
        let d = 0;
        for (let c = 0; c < 4; c++) {
          const s = Math.abs(A.data[i + c] - C.data[i + c]);
          if (s > d) d = s;
        }
        if (d > 0) n++;
        if (d > maks) maks = d;
      }
    }
    return { n: n, maks: maks };
  }, a, b, k);

  /* dua petak berisi gambar yang sama, dan dua petak berisi gambar berbeda */
  const sama = r => r.maks <= 1;
  const berbeda = r => r.maks > 12;

  await page.evaluate(() => window.banding.atur(0));
  await resolv(700);
  const kanan0 = await potretPenuh();

  await page.evaluate(() => window.banding.atur(100));
  await resolv(700);
  const kiri100 = await potretPenuh();

  await page.evaluate(() => window.banding.atur(50));
  await resolv(700);
  const tengah = await potretPenuh();

  lapor(berbeda(await bedaWilayah(kanan0, kiri100, petak(0.62))),
    'sisi kanan dan sisi kiri memang berbeda gambar');
  lapor(sama(await bedaWilayah(tengah, kanan0, petak(0.62))),
    'pada 50%, petak 62% menampilkan isi sisi kanan');
  lapor(sama(await bedaWilayah(tengah, kiri100, petak(0.38))),
    'pada 50%, petak 38% menampilkan isi sisi kiri');
  lapor(berbeda(await bedaWilayah(tengah, kanan0, petak(0.38))),
    'petak kiri bukan sekadar salinan petak kanan');

  console.log('\n4. geser dengan mouse dan papan tombol');
  const pegangan = await page.evaluate(() => {
    const k = document.getElementById('pembatas').getBoundingClientRect();
    return { x: k.left + k.width / 2, y: k.top + k.height / 2 };
  });
  await page.mouse.move(pegangan.x, pegangan.y);
  await page.mouse.down();
  await page.mouse.move(kotak.left + kotak.width * 0.7, pegangan.y, { steps: 8 });
  await page.mouse.up();
  await resolv(300);
  const setelahSeret = await page.evaluate(() => window.banding.belah());
  lapor(Math.abs(setelahSeret - 70) < 3, 'seret pembatas ke 70% -> ' + Math.round(setelahSeret) + '%');
  lapor(await page.evaluate(() => {
    const c = window.banding.kanan().getContainer().style.clipPath;
    return c.indexOf('70%') !== -1;
  }), 'potongan wadah ikut bergeser ke 70%');

  await page.focus('#pembatas');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await resolv(200);
  const setelahTombol = await page.evaluate(() => window.banding.belah());
  lapor(Math.abs(setelahTombol - (setelahSeret - 4)) < 1, 'dua kali panah kiri mengurangi 2% -> ' + Math.round(setelahTombol) + '%');
  lapor(await page.evaluate(() => document.getElementById('pembatas').getAttribute('aria-valuenow')) ===
    String(Math.round(setelahTombol)), 'aria-valuenow mengikuti posisi');

  console.log('\n5. sorot di luar zona terbangun');
  await page.evaluate(() => window.banding.atur(0));
  await resolv(500);

  /* Petaknya ditaruh di atas sel yang memang di luar zona terbangun, dan
     titiknya harus benar-benar terlihat: kalau tertutup kartu legenda atau
     ringkasan, potretnya tidak akan berubah walau layernya berubah. */
  const titikSel = await page.evaluate(() => {
    const kanan = window.banding.kanan();
    const kotak = kanan.getContainer().getBoundingClientRect();
    const bebas = function (x, y) {
      const el = document.elementFromPoint(x, y);
      return !!(el && el.closest && el.closest('#peta-kanan'));
    };
    const calon = window.banding.bangunan().getLayers().filter(function (l) {
      return l.feature.properties.zona_terbangun === false;
    });
    for (let i = 0; i < calon.length; i++) {
      const p = kanan.latLngToContainerPoint(calon[i].getBounds().getCenter());
      const x = Math.round(kotak.left + p.x);
      const y = Math.round(kotak.top + p.y);
      if (x < 130 || y < 130 || x > kotak.width - 130 || y > kotak.top + kotak.height - 130) continue;
      if (!bebas(x, y)) continue;
      return { x: x, y: y, i: i };
    }
    return null;
  });
  lapor(!!titikSel, 'ada sel di luar zona terbangun yang terlihat di layar');

  /* Petaknya kecil dan tepat di atas selnya. Sel 400 m pada zoom seluruh
     kabupaten hanya beberapa piksel, jadi petak 120 px bisa "berhasil" hanya
     karena kebetulan — tanpa benar-benar memuat sel yang berubah warna. */
  /* Petaknya 60 px, bukan 11 px: sel 400 m pada zoom 12 hanya sekitar 10 px,
     dan pembulatan koordinat layar bisa menggeser titik tengahnya satu piksel. */
  const petakSel = titikSel && { x: titikSel.x - 30, y: titikSel.y - 30, width: 60, height: 60 };

  if (petakSel) {
    const sebelumSorot = await potretPenuh();
    await page.click('#sorot');
    await resolv(900);
    const sesudahSorot = await potretPenuh();

    const gaya = await page.evaluate((i) => {
      const l = window.banding.bangunan().getLayers()
        .filter(x => x.feature.properties.zona_terbangun === false)[i];
      return l.options.fillColor;
    }, titikSel.i);

    const berubah = await bedaWilayah(sebelumSorot, sesudahSorot, petakSel);
    lapor(await page.evaluate(() => document.getElementById('sorot').checked), 'kotak centang sorot terpasang');
    lapor(gaya === '#b3175f', 'sel di luar zona berubah warna jadi ' + gaya);
    lapor(berbeda(berubah), 'petak di sekitar sel berubah di layar (' + berubah.n +
      ' piksel, selisih warna sampai ' + berubah.maks + ')');
    await page.click('#sorot');
    await resolv(700);
    const kembali = await potretPenuh();
    const pulih = await bedaWilayah(kembali, sebelumSorot, petakSel);

    /* Sisa selisihnya hanya belasan piksel di tepi sel: tebal garis sel
       berubah 1 px -> 0,5 px saat sorot dimatikan, jadi antialias tepinya
       tidak persis sama dengan gambar pertama. Bukan warna sorot yang
       tertinggal — selisihnya di kanal biru, sedangkan sorot merah muda
       menekan biru. Karena itu ambangnya kecil tapi tidak nol. */
    lapor(pulih.maks <= 12,
      'mematikan sorot mengembalikan gambar semula: sisa selisih ' + pulih.maks +
      ' tingkat di ' + pulih.n + ' piksel tepi sel (saat sorot hidup ' +
      berubah.maks + ')');
  }

  console.log('\n6. tata letak');
  const lebih = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > window.innerWidth,
    y: document.documentElement.scrollHeight > window.innerHeight,
  }));
  lapor(!lebih.x && !lebih.y, 'tidak ada gulir halaman yang tidak dikehendaki');

  const lebar = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const tumpang = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const legenda = r('.legenda');
    const ringkas = r('.ringkas');
    const zoom = r('.leaflet-control-zoom');
    const label = r('#label-kiri');
    const kaki = r('.kaki-halaman');
    const kotakPeta = r('.peta-bungkus');
    return {
      legendaVsRingkas: tumpang(legenda, ringkas),
      labelVsZoom: tumpang(label, zoom),
      kartuKeluarPeta: legenda.bottom > kaki.top + 1 || ringkas.bottom > kaki.top + 1,
      kakiTerlihat: kaki.height > 10 && getComputedStyle(document.querySelector('.kaki-halaman')).overflow !== 'hidden'
        ? true : kaki.height > 10,
      barisLegenda: document.querySelectorAll('#legenda-pola li').length,
    };
  });
  lapor(!lebar.legendaVsRingkas, 'kartu legenda dan ringkasan tidak bertumpuk');
  lapor(!lebar.labelVsZoom, 'label "Pola ruang" tidak menimpa kontrol zoom');
  lapor(!lebar.kartuKeluarPeta, 'kartu tidak melewati kaki halaman');
  lapor(lebar.kakiTerlihat, 'kaki halaman (atribusi) terlihat');
  lapor(lebar.barisLegenda === 13, 'legenda pola ruang memuat 13 kelas');

  await page.setViewport({ width: 390, height: 780 });
  await resolv(900);
  const sempit = await page.evaluate(() => {
    const k = document.querySelector('.peta-bungkus').getBoundingClientRect();
    const l = document.querySelector('.legenda').getBoundingClientRect();
    const p = document.getElementById('pembatas').getBoundingClientRect();
    const kanan = window.banding.kanan().getContainer().getBoundingClientRect();
    return {
      petaTinggi: Math.round(k.height),
      petaLebar: Math.round(k.width),
      legendaDalamPeta: l.bottom <= k.bottom + 1 && l.left >= k.left - 1,
      pembatasLebar: Math.round(p.width),
      kananLebar: Math.round(kanan.width),
      gulir: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  lapor(sempit.petaTinggi > 300, 'peta tetap tinggi di layar 390 px: ' + sempit.petaTinggi + ' px');
  lapor(sempit.legendaDalamPeta, 'legenda tidak keluar dari peta di layar sempit');
  lapor(!sempit.gulir, 'tidak ada gulir mendatar di layar sempit');
  lapor(sempit.pembatasLebar >= 40, 'area sentuh pembatas ' + sempit.pembatasLebar + ' px');
  lapor(Math.abs(sempit.kananLebar - sempit.petaLebar) <= 1,
    'wadah peta kanan selebar wadahnya: ' + sempit.kananLebar + ' vs ' + sempit.petaLebar + ' px');

  console.log('\n7. konsol');
  lapor(galat.length === 0, 'tidak ada galat konsol' + (galat.length ? ': ' + galat.slice(0, 3).join(' | ') : ''));

  console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
  await browser.close();
  server.close();
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error('GAGAL: ' + e.message); try { server.close(); } catch (_) {} process.exit(1); });

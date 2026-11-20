/*
 * Tangkap layar tiga tingkat tampilan untuk dokumentasi.
 *   node tools/tangkap.js
 * Hasil: web/preview.png (kabupaten), web/preview-kecamatan.png, web/preview-desa.png
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const AKAR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8013);
const CHROME = process.env.CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TIPE = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.geojson': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(function (req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(AKAR, url);
  if (!f.startsWith(AKAR)) { res.statusCode = 403; return res.end(); }
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (_) {}
  fs.readFile(f, function (e, buf) {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', TIPE[path.extname(f).toLowerCase()] || 'application/octet-stream');
    res.end(buf);
  });
});

const tunggu = function (ms) { return new Promise(function (s) { setTimeout(s, ms); }); };

(async function () {
  await new Promise(function (s) { server.listen(PORT, '127.0.0.1', s); });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--hide-scrollbars'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + PORT + '/web/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(function () {
    return (document.getElementById('status') || { textContent: '' }).textContent.indexOf('Menampilkan') !== -1;
  }, { timeout: 60000 });
  await tunggu(1200);
  await page.screenshot({ path: path.join(AKAR, 'web', 'preview.png') });

  const kec = await page.evaluate(function () {
    const el = document.getElementById('pilih-kec');
    const v = el.options[2].value;
    el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
    return v;
  });
  await page.waitForFunction(function () {
    return (document.getElementById('status') || { textContent: '' }).textContent.indexOf('poligon') !== -1;
  }, { timeout: 60000 });
  await tunggu(1500);
  await page.screenshot({ path: path.join(AKAR, 'web', 'preview-kecamatan.png') });

  const desa = await page.evaluate(function () {
    const el = document.getElementById('pilih-desa');
    const v = el.options[3].value;
    el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
    return v;
  });
  await page.waitForFunction(function () {
    return (document.getElementById('status') || { textContent: '' }).textContent.indexOf('poligon') !== -1;
  }, { timeout: 60000 });
  await tunggu(1800);
  await page.screenshot({ path: path.join(AKAR, 'web', 'preview-desa.png') });

  console.log('kecamatan: ' + kec + ' | desa: ' + desa);
  console.log('tiga tangkapan layar ditulis ke web/preview*.png');
  await browser.close();
  server.close();
})().catch(function (e) {
  console.error('GAGAL: ' + e.message);
  try { server.close(); } catch (_) {}
  process.exit(1);
});

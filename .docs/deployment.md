# Panduan Deployment & Operasional — Serayu

Dokumen ini memuat panduan deployment aplikasi Serayu untuk lingkungan lokal, server statis, dan cloud hosting.

---

## 1. Target Deployment

| Target | Tipe Lingkungan | Port Bawaan | Web Server / Runtime | Catatan Khusus |
|---|---|---|---|---|
| **Lokal (Windows)** | Development | `8080` (fallback 8008, 8081..) | PowerShell + Python `http.server` | Menjalankan `.\serve.ps1`. Browser wajib lewat HTTP karena restriksi CORS protokol `file://`. |
| **GitHub Pages** | Produksi Statis | `443` (HTTPS) | Static CDN / Jekyll bypass | Buat file `.nojekyll` di root repository agar direktori bertitik/underscore tidak diabaikan. |
| **Cloudflare Pages / Vercel** | Produksi Jamstack | `443` (HTTPS) | Edge CDN | Konfigurasi Root Directory ke `./` dan Build Output ke `./`. Tanpa build step. |
| **Nginx / Apache (VPS/On-Premise)** | Produksi Mandiri | `80` / `443` | Nginx 1.20+ / Apache 2.4+ | Konfigurasi MIME type `.geojson`, `.json`, `.obj`, `.gltf` dan kompresi gzip/brotli. |

---

## 2. Environment Variables Matrix (Public-Safe — SP-032 / SP-033 Compliance)

Aplikasi Serayu dirancang **100% Client-Side Static**:
- **0 File `.env` Produksi:** Tidak ada rahasia database, API key komersial, atau kredensial rahasia.
- **0 Rahasia Dapur:** Seluruh konfigurasi jalur data didefinisikan secara relatif.

| Variabel Konfigurasi | Wajib Dev | Wajib Prod | Nilai Default | Keterangan |
|---|---|---|---|---|
| `$env:PORT` | Opsional | N/A | `8080` | Port kustom saat menjalankan `serve.ps1`. |
| `$env:CHROME` | Opsional | N/A | Lokasi Chrome standar | Path executable Chrome untuk pengujian headless di `tools/`. |

---

## 3. Konfigurasi Produksi Nginx

Berikut rekomendasi blok server Nginx untuk melayani data GeoJSON, 3D assets, dan modul URA SPACE:

```nginx
server {
    listen 80;
    server_name tataruang.banjarnegarakab.go.id;
    root /var/www/serayu;
    index index.html web/index.html;

    # Konfigurasi MIME Type untuk GIS & 3D
    types {
        application/json                      json;
        application/geo+json                  geojson;
        model/obj                             obj;
        model/gltf-binary                     glb;
        model/gltf+json                       gltf;
    }

    # Kompresi Gzip untuk GeoJSON & Model 3D
    gzip on;
    gzip_types application/json application/geo+json text/css application/javascript model/obj;
    gzip_min_length 1024;
    gzip_comp_level 6;

    # Caching Agresif untuk Aset Statis
    location ~* \.(geojson|json|glb|obj|png|jpg|jpeg|svg|css|js)$ {
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }

    # Fallback SPA / Entry Point
    location / {
        try_files $uri $uri/ /web/index.html;
    }
}
```

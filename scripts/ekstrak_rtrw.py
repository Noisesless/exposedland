"""Membongkar teks Perda RTRW Banjarnegara 2023-2043 ke berkas teks.

PDF-nya 252 halaman hasil pindai tanda tangan tapi teksnya masih vektor,
jadi bisa diekstrak langsung tanpa OCR.

Unduh dulu berkasnya (tidak ikut repo, 35 MB):

    curl -L -o new/rtrw-2023.pdf \
      "https://jdih.banjarnegarakab.go.id/storage/produk_hukum/2023/LD%206%20(RTRW).pdf"

Jalankan: .venv\\Scripts\\python.exe scripts\\ekstrak_rtrw.py
"""
import sys
from pathlib import Path

import pypdf

SUMBER = Path(r"new\rtrw-2023.pdf")
TUJUAN = Path(r"new\rtrw-2023.txt")

reader = pypdf.PdfReader(str(SUMBER))
bagian = []
for i, halaman in enumerate(reader.pages, start=1):
    teks = halaman.extract_text() or ""
    bagian.append("\n\n===== halaman %d =====\n%s" % (i, teks.strip()))

TUJUAN.write_text("\n".join(bagian), encoding="utf-8")
print("halaman:", len(reader.pages))
print("tulis:", TUJUAN, TUJUAN.stat().st_size, "byte")

"""Membandingkan pola ruang di data dengan daftar kecamatan di Perda RTRW.

Perda Nomor 6 Tahun 2023 (RTRW Kabupaten Banjarnegara 2023-2043) menyebut luas
dan daftar kecamatan untuk tiap kelas pola ruang dalam bentuk kalimat, bukan
tabel. Skrip ini menguji klaim itu terhadap geometri di `geojson/index`, jadi
yang keluar adalah kecamatan yang disebut perda tapi tidak muncul di data
(vice versa), beserta selisih luasnya.

Jalankan: .venv\\Scripts\\python.exe scripts\\cek_rtrw.py
"""

import json
import re
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform as ubah
from shapely.validation import make_valid

AKAR = Path(__file__).resolve().parent.parent
INDEX = AKAR / "geojson" / "index"
TEKS = AKAR / "new" / "rtrw-2023.txt"

# UTM zona 49S: hitungan luas dalam meter, bukan derajat
KE_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32749", always_xy=True).transform

# Pasal-pasal pola ruang di Batang Tubuh. Angka luas dibulatkan seperti di
# perda; daftar kecamatan disalin apa adanya dari teks Pasal 26 sampai Pasal 35.
PERDA = {
    "31010000": dict(pasal=25, nama="Badan Air", luas=1516, kec="seluruh"),
    "31021000": dict(pasal=26, nama="Kawasan Hutan Lindung", luas=2740, kec=[
        "Banjarmangu", "Batur", "Kalibening", "Karangkobar", "Mandiraja",
        "Pandanarum", "Pejawaran", "Purwanegara"]),
    "31041100": dict(pasal=27, nama="Cagar Alam", luas=113, kec=[
        "Sigaluh", "Pagedongan", "Batur"]),
    "31071100": dict(pasal=28, nama="Kawasan Keunikan Batuan dan Fosil", luas=51, kec=[
        "Pagedongan"]),
    "31080000": dict(pasal=29, nama="Kawasan Cagar Budaya", luas=36, kec=["Batur"]),
    "32022000": dict(pasal=31, nama="Kawasan Hutan Produksi Terbatas", luas=15236, kec=[
        "Banjarmangu", "Banjarnegara", "Batur", "Bawang", "Kalibening",
        "Karangkobar", "Mandiraja", "Madukara", "Pagedongan", "Pagentan",
        "Pandanarum", "Pejawaran", "Punggelan", "Purwanegara",
        "Purwareja Klampok", "Sigaluh", "Susukan", "Wanayasa"]),
    "32021000": dict(pasal=31, nama="Kawasan Hutan Produksi Tetap", luas=384, kec=[
        "Kalibening", "Mandiraja", "Purwanegara", "Sigaluh", "Wanayasa"]),
    "32041000": dict(pasal=32, nama="Kawasan Tanaman Pangan", luas=14561, kec=[
        "Banjarmangu", "Banjarnegara", "Bawang", "Kalibening", "Karangkobar",
        "Madukara", "Mandiraja", "Pagedongan", "Pagentan", "Pandanarum",
        "Pejawaran", "Punggelan", "Purwanegara", "Purwareja Klampok", "Rakit",
        "Sigaluh", "Susukan", "Wanadadi", "Wanayasa"]),
    "32042000": dict(pasal=32, nama="Kawasan Hortikultura", luas=44382, kec="seluruh"),
    "32043000": dict(pasal=32, nama="Kawasan Perkebunan", luas=17985, kec=[
        "Banjarmangu", "Banjarnegara", "Batur", "Bawang", "Kalibening",
        "Karangkobar", "Madukara", "Mandiraja", "Pagedongan", "Pagentan",
        "Pandanarum", "Pejawaran", "Punggelan", "Purwanegara",
        "Purwareja Klampok", "Sigaluh", "Susukan", "Wanadadi", "Wanayasa"]),
    "32080000": dict(pasal=33, nama="Kawasan Peruntukan Industri", luas=402, kec=[
        "Bawang", "Mandiraja", "Purwanegara", "Purwareja Klampok", "Rakit",
        "Sigaluh", "Susukan", "Wanadadi"]),
    "32101000": dict(pasal=35, nama="Kawasan Permukiman Perkotaan", luas=6567, kec="seluruh"),
    "32102000": dict(pasal=35, nama="Kawasan Permukiman Perdesaan", luas=10516, kec="seluruh"),
}

# Kelas yang tidak punya poligon sendiri: penunjukan kawasan, bukan bidang
TANPA_POLIGON = {
    "Kawasan Pariwisata": "Pasal 34 menyebut 60-an lokasi wisata; penunjukannya "
                          "menumpang pada kelas lain, tidak menjadi kelas poligon sendiri.",
    "Kawasan Pertahanan dan Keamanan": "Pasal 36 menyebut Koramil/Posmil per "
                                       "kecamatan; skalanya titik, bukan bidang.",
}

AMBANG_HA = 5.0  # irisan lebih kecil dari ini dianggap sliver, bukan keberadaan


def bersih(g):
    if g is None:
        return None
    if not g.is_valid:
        try:
            g = make_valid(g)
        except Exception:
            g = g.buffer(0)
    if g.geom_type == "GeometryCollection":
        bidang = [x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
        g = bidang[0] if len(bidang) == 1 else __import__("shapely.geometry", fromlist=["MultiPolygon"]).MultiPolygon(
            [b for x in bidang for b in (x.geoms if x.geom_type == "MultiPolygon" else [x])])
    return g


def main():
    pola = json.loads((INDEX / "kab_pola_ruang.geojson").read_text(encoding="utf-8"))
    kec = json.loads((INDEX / "batas_kecamatan.geojson").read_text(encoding="utf-8"))

    batas = {}
    for f in kec["features"]:
        g = bersih(shape(f["geometry"]))
        batas[f["properties"]["kecamatan"]] = ubah(KE_UTM, g)

    print("=== luas: perda vs data ===")
    total_perda = 0
    total_data = 0
    selisih = []
    for f in pola["features"]:
        p = f["properties"]
        kode = p["KODKWS"]
        acuan = PERDA.get(kode)
        total_data += p["luas_ha"]
        if not acuan:
            print("  %s %-38s %10.2f ha  (tidak ada di perda)" % (kode, p["NAMOBJ"], p["luas_ha"]))
            continue
        total_perda += acuan["luas"]
        beda = p["luas_ha"] - acuan["luas"]
        tanda = "" if abs(beda) < 1 else "  <-- selisih %.2f ha" % beda
        if abs(beda) >= 1:
            selisih.append((kode, p["NAMOBJ"], acuan["luas"], p["luas_ha"], beda))
        print("  %s %-38s perda %8d  data %10.2f%s" % (kode, p["NAMOBJ"], acuan["luas"], p["luas_ha"], tanda))
    print("  %-45s perda %8.0f  data %10.2f" % ("TOTAL", total_perda, total_data))

    print("\n=== kecamatan: yang disebut perda tapi tidak ada di data ===")
    ada_masalah = False
    for f in pola["features"]:
        p = f["properties"]
        acuan = PERDA.get(p["KODKWS"])
        if not acuan or acuan["kec"] == "seluruh":
            continue
        g = ubah(KE_UTM, shape(f["geometry"]))
        luas_kec = {}
        for nama, kg in batas.items():
            if not kg.intersects(g):
                continue
            irisan = kg.intersection(g).area / 10000.0
            if irisan >= AMBANG_HA:
                luas_kec[nama] = irisan
        disebut = set(acuan["kec"])
        ada = set(luas_kec)
        hilang = sorted(disebut - ada)
        lebih = sorted(ada - disebut)
        if not hilang and not lebih:
            print("  %-40s cocok (%d kecamatan)" % (acuan["nama"], len(ada)))
            continue
        ada_masalah = True
        print("  %-40s Pasal %d" % (acuan["nama"], acuan["pasal"]))
        for n in hilang:
            print("     disebut perda, tidak ada di data: %s" % n)
        for n in lebih:
            print("     ada di data (%.1f ha), tidak disebut perda: %s" % (luas_kec[n], n))

    print("\n=== kelas yang sengaja tidak punya poligon ===")
    for nama, alasan in TANPA_POLIGON.items():
        print("  %-40s %s" % (nama, alasan))

    if selisih:
        print("\n=== selisih luas sebesar 1 ha atau lebih ===")
        for kode, nama, perda, data, beda in selisih:
            print("  %-38s perda %8d  data %10.2f  beda %+.2f" % (nama, perda, data, beda))

    # salah tulis angka di badan perda
    if TEKS.exists():
        teks = TEKS.read_text(encoding="utf-8")
        m = re.search(r"Badan Air.{0,120}?1\.516\s*\(([^)]+)\)", teks, re.S)
        if m:
            print("\n=== catatan redaksional ===")
            print("  Pasal 25 menulis angka 1.516 tetapi hurufnya \"%s\"." % m.group(1).strip())
            print("  Data memakai 1.516,34 ha, jadi yang benar angka 1.516.")


if __name__ == "__main__":
    main()

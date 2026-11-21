"""
Contoh layer pembanding: sebaran bangunan OSM per sel 400 m.

Halaman web/banding.html membandingkan pola ruang (dokumen rencana) dengan
"apa yang ada di lapangan". Untuk menguji mekanismenya, layer kanan di sini
diisi data bangunan OpenStreetMap yang sudah ada di repo ini — bukan hasil
klasifikasi citra, dan bukan pengganti Prithvi.

Sengaja hanya MENGHITUNG KEBERADAAN. OSM tidak lengkap di perdesaan, jadi
sel tanpa bangunan tidak berarti tidak ada bangunan. Karena itu keluarannya
hanya sel yang berisi >= 3 bangunan; tidak ada satu pun sel "kosong" yang
ditulis, supaya halaman tidak bisa salah dibaca sebagai peta ketiadaan.
"""
import json, math, os, time

from pyproj import Transformer
from shapely import make_valid
from shapely.geometry import Point, box, mapping, shape
from shapely.strtree import STRtree

AKAR = r"I:\tataruang"
BANGUNAN = os.path.join(AKAR, "new", "buildings_banjarnegara.geojson")
POLA = os.path.join(AKAR, "geojson", "full", "pola_ruang.geojson")
KEC = os.path.join(AKAR, "geojson", "index", "batas_kecamatan.geojson")
KELUAR = os.path.join(AKAR, "geojson", "index", "contoh_bangunan.geojson")

UTM = "EPSG:32749"          # UTM 49S, zona yang mencakup Banjarnegara
SEL = 400.0                 # sisi sel, meter
MIN_BANGUNAN = 3
PRESISI = 6                 # ~0.11 m, sama dengan keluaran konversi

# zona yang memang boleh berisi bangunan; di luar ini, bangunan yang tercatat
# OSM berarti ada pemanfaatan yang tidak sesuai dengan pola ruang
ZONA_TERBANGUN = {"32101000", "32102000", "32080000"}


def bersihkan(g):
    """
    Rapikan geometri sumber.

    Beberapa fitur pola ruang berisi campuran garis dan bidang, dan untuk itu
    make_valid melempar 'Overlay input is mixed-dimension'. buffer(0) jadi
    jalan keluarnya, lalu sisa geometri garis dibuang.
    """
    try:
        if not g.is_valid:
            g = make_valid(g)
    except Exception:
        try:
            g = g.buffer(0)
        except Exception:
            return None
    if g.is_empty:
        return None
    if g.geom_type == "GeometryCollection":
        bidang = [b for b in g.geoms if b.geom_type in ("Polygon", "MultiPolygon")]
        if not bidang:
            return None
        g = bidang[0] if len(bidang) == 1 else bidang[0].union(bidang[1:])
    return g if g.geom_type in ("Polygon", "MultiPolygon") and not g.is_empty else None


def muat(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["features"]


def main():
    mulai = time.time()
    print("memuat bangunan ...", flush=True)
    bangunan = muat(BANGUNAN)
    print(f"  {len(bangunan):,} bangunan")

    to_utm = Transformer.from_crs("EPSG:4326", UTM, always_xy=True)
    to_wgs = Transformer.from_crs(UTM, "EPSG:4326", always_xy=True)

    # hitung sel per titik wakil bangunan; titik wakil dipakai supaya tidak
    # perlu memproyeksikan 300 ribu poligon utuh
    sel = {}
    for f in bangunan:
        g = f.get("geometry")
        if not g:
            continue
        try:
            p = shape(g).representative_point()
        except Exception:
            continue
        x, y = to_utm.transform(p.x, p.y)
        if not (math.isfinite(x) and math.isfinite(y)):
            continue
        kunci = (int(x // SEL), int(y // SEL))
        sel[kunci] = sel.get(kunci, 0) + 1
    print(f"  {len(sel):,} sel terisi")

    padat = {k: n for k, n in sel.items() if n >= MIN_BANGUNAN}
    print(f"  {len(padat):,} sel dengan >= {MIN_BANGUNAN} bangunan")

    print("memuat pola ruang & batas kecamatan ...", flush=True)
    pola = []
    for f in muat(POLA):
        g = bersihkan(shape(f["geometry"]))
        if g is None:
            continue
        pola.append((g, f["properties"].get("KODKWS"), f["properties"].get("NAMOBJ")))
    pohon_pola = STRtree([p[0] for p in pola])

    kec = []
    for f in muat(KEC):
        g = bersihkan(shape(f["geometry"]))
        if g is None:
            continue
        kec.append((g, f["properties"].get("kecamatan"), f["properties"].get("slug")))
    pohon_kec = STRtree([k[0] for k in kec])

    def cari(pohon, daftar, titik):
        for i in pohon.query(titik):
            if daftar[i][0].contains(titik):
                return daftar[i]
        return None

    fitur = []
    for (ix, iy), jumlah in sorted(padat.items()):
        kotak = box(ix * SEL, iy * SEL, (ix + 1) * SEL, (iy + 1) * SEL)

        # pola ruang dan batas kecamatan berkoordinat derajat, sedangkan sel
        # dihitung dalam UTM — jadi titik ujinya dikembalikan dulu ke derajat
        lon, lat = to_wgs.transform(kotak.centroid.x, kotak.centroid.y)
        titik = Point(lon, lat)

        z = cari(pohon_pola, pola, titik)
        k = cari(pohon_kec, kec, titik)
        if k is None:
            continue          # di luar kabupaten

        # koordinat sel dibulatkan ke grid yang sama dengan berkas lain;
        # bujur melebar sebesar 1/cos(lintang), kalau tidak selnya jadi persegi
        # panjang yang menyimpang ~1% (4 m pada sisi 400 m)
        setengah_lat = (SEL / 2) / 111320.0
        setengah_lon = setengah_lat / max(0.2, math.cos(math.radians(lat)))
        kotak_wgs = box(round(lon - setengah_lon, PRESISI), round(lat - setengah_lat, PRESISI),
                        round(lon + setengah_lon, PRESISI), round(lat + setengah_lat, PRESISI))

        kode = z[1] if z else None
        fitur.append({
            "type": "Feature",
            "properties": {
                "jumlah": jumlah,
                "zona": kode,
                "zona_nama": z[2] if z else None,
                "zona_terbangun": kode in ZONA_TERBANGUN if kode else None,
                "kecamatan": k[1],
                "slug": k[2],
            },
            "geometry": mapping(kotak_wgs),
        })

    os.makedirs(os.path.dirname(KELUAR), exist_ok=True)
    with open(KELUAR, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": fitur},
                  f, ensure_ascii=False, separators=(",", ":"))

    sesuai = sum(1 for f in fitur if f["properties"]["zona_terbangun"])
    tanpa = sum(1 for f in fitur if f["properties"]["zona"] is None)
    print(f"\n{len(fitur):,} sel ditulis -> {os.path.getsize(KELUAR)/1024:.0f} KB")
    print(f"  di zona terbangun     : {sesuai:,}")
    print(f"  di zona lain          : {len(fitur) - sesuai - tanpa:,}")
    print(f"  tanpa kelas pola ruang: {tanpa:,}")
    print(f"selesai dalam {time.time() - mulai:.1f} s")


if __name__ == "__main__":
    main()

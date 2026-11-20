"""
Buat layer pola ruang & rawan bencana tingkat KABUPATEN yang ringan.

File detail (37 MB, 10.816 poligon) tidak mungkin dimuat untuk tampilan awal.
Di sini poligon digabung (dissolve) per kelas lalu disederhanakan, sehingga
tampilan kabupaten tetap informatif tanpa mengorbankan waktu muat.
"""
import json, os, time
from collections import defaultdict

from shapely import make_valid, set_precision, union_all
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

GJ = r"I:\tataruang\geojson"
TOL = 0.00025          # ~25 m, cukup halus untuk zoom 10-12
PRESISI = 1e-6         # ~0.11 m, sama dengan output konversi


def gabung_aman(geoms):
    """
    union dengan grid snapping.

    Poligon hasil sumber sering bertetangga tanpa presisi sama, sehingga GEOS
    melempar 'TopologyException: side location conflict'. Menynap semua input
    ke grid yang sama menyelesaikannya; grid dilonggarkan bertahap bila perlu.
    """
    bersih = []
    for g in geoms:
        try:
            if not g.is_valid:
                g = make_valid(g)
            if g.is_empty:
                continue
            bersih.append(g)
        except Exception:
            continue
    if not bersih:
        return None

    for grid in (PRESISI, 1e-5, 1e-4):
        try:
            return union_all(bersih, grid_size=grid)
        except Exception:
            continue

    # upaya terakhir: gabung satu per satu, lewati yang gagal
    acc = None
    for g in bersih:
        try:
            acc = g if acc is None else acc.union(g)
        except Exception:
            continue
    return acc


def muat(nama):
    with open(os.path.join(GJ, "full", f"{nama}.geojson"), encoding="utf-8") as f:
        return json.load(f)["features"]


def tulis(path, fitur):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": fitur},
                  f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def rapikan(geom):
    if geom.geom_type == "GeometryCollection":
        geom = unary_union([g for g in geom.geoms
                            if g.geom_type in ("Polygon", "MultiPolygon")])
    if geom.is_empty:
        return None
    geom = geom.simplify(TOL, preserve_topology=True)
    if geom.is_empty:
        return None
    geom = set_precision(geom, PRESISI)
    return geom


def kategori_krb(v):
    s = str(v or "").strip()
    if not s or s.lower() == "tidak ada":
        return []
    s = s.lower()
    out = []
    if "banjir" in s:
        out.append("banjir")
    if "gerakan tanah" in s:
        out.append("gerakan_tanah")
    if "letusan" in s:
        out.append("letusan")
    return out


t0 = time.time()
pola = muat("pola_ruang")
print(f"muat {len(pola)} poligon")

# ---------- pola ruang per kelas ----------
per_kelas = defaultdict(list)
nama_kelas = {}
for f in pola:
    p = f["properties"]
    kode = p.get("KODKWS")
    per_kelas[kode].append(shape(f["geometry"]))
    nama_kelas[kode] = p.get("NAMOBJ")

fitur = []
for kode, geoms in sorted(per_kelas.items()):
    t1 = time.time()
    gabung = rapikan(gabung_aman(geoms))
    if gabung is None:
        continue
    luas = sum(f["properties"].get("luas_ha_geo") or 0
               for f in pola if f["properties"].get("KODKWS") == kode)
    fitur.append({
        "type": "Feature",
        "properties": {
            "KODKWS": kode,
            "NAMOBJ": nama_kelas[kode],
            "luas_ha": round(luas, 2),
            "jumlah_poligon": len(geoms),
        },
        "geometry": mapping(gabung),
    })
    print(f"  {kode} {str(nama_kelas[kode])[:38]:<38} {len(geoms):>5} poligon -> "
          f"{len(gabung.geoms) if hasattr(gabung,'geoms') else 1:>3} bagian ({time.time()-t1:.1f}s)")

sz = tulis(os.path.join(GJ, "index", "kab_pola_ruang.geojson"), fitur)
print(f"index/kab_pola_ruang.geojson  {len(fitur)} kelas  {sz/1048576:.2f} MB")

# ---------- rawan bencana per kategori ----------
per_kat = defaultdict(list)
for f in pola:
    for k in kategori_krb(f["properties"].get("KRB_03")):
        per_kat[k].append(shape(f["geometry"]))

fitur = []
for kat, geoms in per_kat.items():
    gabung = rapikan(gabung_aman(geoms))
    if gabung is None:
        continue
    luas = sum(f["properties"].get("luas_ha_geo") or 0
               for f in pola if kat in kategori_krb(f["properties"].get("KRB_03")))
    fitur.append({
        "type": "Feature",
        "properties": {"kategori": kat, "luas_ha": round(luas, 2), "jumlah_poligon": len(geoms)},
        "geometry": mapping(gabung),
    })
    print(f"  KRB {kat:<16} {len(geoms):>5} poligon")

sz = tulis(os.path.join(GJ, "index", "kab_krb.geojson"), fitur)
print(f"index/kab_krb.geojson  {len(fitur)} kategori  {sz/1048576:.2f} MB")

# ---------- jaringan garis tingkat kabupaten ----------
# Garis tidak perlu di-dissolve: tiap ruas memang objek tersendiri. Yang
# meringankan hanya penyederhanaan simpul, karena pada zoom 10-11 detail
# di bawah ~25 m tidak terlihat.
for nama, ket in (("transportasi", "jaringan jalan"), ("sungai", "jaringan sungai")):
    garis = muat(nama)
    fitur = []
    for f in garis:
        g = shape(f["geometry"])
        if not g.is_valid:
            g = make_valid(g)
        if g.is_empty or g.geom_type not in ("LineString", "MultiLineString"):
            continue
        g = g.simplify(TOL, preserve_topology=False)
        if g.is_empty:
            continue
        g = set_precision(g, PRESISI)
        p = f["properties"]
        fitur.append({
            "type": "Feature",
            "properties": {
                "NAMOBJ": p.get("NAMOBJ"),
                "REMARK": p.get("REMARK"),
                "STSJRN": p.get("STSJRN"),
                "panjang_km_geo": p.get("panjang_km_geo"),
                "kecamatan": p.get("kecamatan"),
            },
            "geometry": mapping(g),
        })
    sz = tulis(os.path.join(GJ, "index", f"kab_{nama}.geojson"), fitur)
    print(f"index/kab_{nama}.geojson  {len(fitur)} ruas {ket}  {sz/1048576:.2f} MB")

print(f"selesai dalam {time.time()-t0:.0f}s")

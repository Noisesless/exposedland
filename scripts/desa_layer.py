"""
Pecah seluruh layer sampai tingkat DESA.

Poligon pola ruang tidak punya atribut desa (hanya WADMKC = kecamatan),
sehingga batas desa dipakai untuk memotong geometri secara spasial.
Hasilnya: geojson/per-desa/<kecamatan>/<desa>/<layer>.geojson
"""
import json, os, re, time
from collections import defaultdict

import numpy as np
from pyproj import Geod
from shapely import force_2d, make_valid
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

SRC = r"I:\tataruang\geojson\full"
DST = r"I:\tataruang\geojson"
AMBANG_M2 = 100.0        # potongan poligon di bawah ini dibuang
PANJANG_MIN = 1.0        # potongan garis di bawah 1 m dibuang
GEOD = Geod(ellps="WGS84")
PER_DERAJAT2 = 1.216e10  # perkiraan m2 per derajat2 di latitude -7.4


def log(m):
    print(m, flush=True)


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", str(s).strip()).strip("-").lower()


def bersih_nama(n):
    n = re.sub(r"^(desa|kelurahan|kel\.?)\s+", "", str(n or "").strip(), flags=re.I)
    return n.strip() or "tanpa-nama"


def luas_m2(g):
    return abs(GEOD.geometry_area_perimeter(g)[0])


def panjang_m(g):
    return abs(GEOD.geometry_length(g))


def bulatkan(c):
    if isinstance(c, (int, float)):
        v = round(float(c), 6)
        return v if v != int(v) else int(v)
    return [bulatkan(x) for x in c]


def tulis(path, fitur):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    feats = []
    for f in fitur:
        g = mapping(f["geom"])
        if g.get("coordinates"):
            g["coordinates"] = bulatkan(g["coordinates"])
        feats.append({"type": "Feature", "properties": f["props"], "geometry": g})
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": feats},
                  fh, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def muat(nama):
    with open(os.path.join(SRC, f"{nama}.geojson"), encoding="utf-8") as f:
        return json.load(f)["features"]


t0 = time.time()

# ---------- batas desa ----------
log("[1/4] memuat batas desa")
desa_rows = muat("batas_desa")
desa = []
lihat_slug = defaultdict(set)
for f in desa_rows:
    p = f["properties"]
    kec = p.get("kecamatan") or "tanpa-kecamatan"
    nama = bersih_nama(p.get("Nama_Desa_") or p.get("Nama_Desa"))
    s = slug(nama)
    if s in lihat_slug[kec]:
        s = f"{s}-{len(lihat_slug[kec])}"
    lihat_slug[kec].add(s)
    desa.append({
        "kec": kec, "kec_slug": slug(kec),
        "nama": nama, "slug": s,
        "geom": shape(f["geometry"]),
        "props": p,
    })
log(f"  {len(desa)} desa dalam {len({d['kec'] for d in desa})} kecamatan")

kunci_desa = list(range(len(desa)))
pohon = STRtree([d["geom"] for d in desa])

# ---------- pola ruang: klip per desa ----------
log("[2/4] memotong pola ruang per desa")
hasil_pola = defaultdict(list)
pola = muat("pola_ruang")
stat = {"utuh": 0, "terpotong": 0, "tanpa_desa": 0, "sliver": 0}

for f in pola:
    g = shape(f["geometry"])
    p = {k: v for k, v in f["properties"].items()}
    idx = [int(i) for i in np.atleast_1d(pohon.query(g))]
    if not idx:
        j = pohon.nearest(g)
        idx = [int(j)] if j is not None else []
        stat["tanpa_desa"] += 1
    if not idx:
        continue

    if len(idx) == 1:
        d = desa[idx[0]]
        p2 = dict(p); p2["desa"] = d["nama"]; p2["kecamatan"] = d["kec"]
        p2["luas_ha_geo"] = round(luas_m2(g) / 10000, 4)
        hasil_pola[(d["kec_slug"], d["slug"])].append({"geom": g, "props": p2})
        stat["utuh"] += 1
        continue

    stat["terpotong"] += 1
    for i in idx:
        d = desa[i]
        try:
            potong = g.intersection(d["geom"])
        except Exception:
            potong = make_valid(g).intersection(d["geom"])
        if potong.is_empty:
            continue
        if potong.geom_type == "GeometryCollection":
            potong = unary_union([x for x in potong.geoms
                                  if x.geom_type in ("Polygon", "MultiPolygon")])
        if potong.is_empty or potong.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        if potong.area * PER_DERAJAT2 < AMBANG_M2:
            stat["sliver"] += 1
            continue
        p2 = dict(p); p2["desa"] = d["nama"]; p2["kecamatan"] = d["kec"]
        p2["luas_ha_geo"] = round(luas_m2(potong) / 10000, 4)
        hasil_pola[(d["kec_slug"], d["slug"])].append({"geom": potong, "props": p2})

log(f"  utuh={stat['utuh']} terpotong={stat['terpotong']} "
    f"sliver_dibuang={stat['sliver']} tanpa_desa={stat['tanpa_desa']}")
log(f"  total potongan: {sum(len(v) for v in hasil_pola.values())}")

# ---------- garis: klip per desa ----------
log("[3/4] memotong jaringan garis per desa")
hasil_garis = {}
for nama in ("transportasi", "sungai"):
    hasil = defaultdict(list)
    for f in muat(nama):
        g = shape(f["geometry"])
        p = {k: v for k, v in f["properties"].items()}
        idx = [int(i) for i in np.atleast_1d(pohon.query(g))]
        if not idx:
            continue
        for i in idx:
            d = desa[i]
            try:
                potong = g.intersection(d["geom"])
            except Exception:
                continue
            if potong.is_empty:
                continue
            if potong.geom_type == "GeometryCollection":
                potong = unary_union([x for x in potong.geoms
                                      if x.geom_type in ("LineString", "MultiLineString")])
            if potong.is_empty or potong.geom_type not in ("LineString", "MultiLineString"):
                continue
            pjg = panjang_m(potong)
            if pjg < PANJANG_MIN:
                continue
            p2 = dict(p); p2["desa"] = d["nama"]; p2["kecamatan"] = d["kec"]
            p2["panjang_km_geo"] = round(pjg / 1000, 4)
            hasil[(d["kec_slug"], d["slug"])].append({"geom": potong, "props": p2})
    hasil_garis[nama] = hasil
    log(f"  {nama}: {sum(len(v) for v in hasil.values())} potongan")

# ---------- tulis ----------
log("[4/4] menulis berkas per desa")
daftar = defaultdict(lambda: {"nama": None, "desa": []})
total_byte = 0
jumlah_berkas = 0

for d in desa:
    kunci = (d["kec_slug"], d["slug"])
    folder = os.path.join(DST, "per-desa", d["kec_slug"], d["slug"])

    # batas desa itu sendiri (1 fitur, untuk garis tepi)
    p = {k: v for k, v in d["props"].items()}
    p["desa"] = d["nama"]
    total_byte += tulis(os.path.join(folder, "batas_desa.geojson"),
                        [{"geom": d["geom"], "props": p}])
    jumlah_berkas += 1

    lapisan = []
    for nama, sumber in (("pola_ruang", hasil_pola),
                         ("transportasi", hasil_garis["transportasi"]),
                         ("sungai", hasil_garis["sungai"])):
        fitur = sumber.get(kunci) or []
        if not fitur:
            continue
        total_byte += tulis(os.path.join(folder, f"{nama}.geojson"), fitur)
        jumlah_berkas += 1
        lapisan.append(nama)

    minx, miny, maxx, maxy = d["geom"].bounds
    c = d["geom"].centroid
    daftar[d["kec_slug"]]["nama"] = d["kec"]
    daftar[d["kec_slug"]]["desa"].append({
        "nama": d["nama"], "slug": d["slug"],
        "luas_ha": round(luas_m2(d["geom"]) / 10000, 2),
        "centroid": [round(c.x, 6), round(c.y, 6)],
        "bbox": [round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)],
        "poligon": len(hasil_pola.get(kunci) or []),
        "layers": ["batas_desa"] + lapisan,
    })

for kec in daftar.values():
    kec["desa"].sort(key=lambda x: x["nama"])

daftar_path = os.path.join(DST, "index", "daftar_desa.json")
with open(daftar_path, "w", encoding="utf-8") as f:
    json.dump({"jumlah": sum(len(k["desa"]) for k in daftar.values()),
               "kecamatan": daftar}, f, ensure_ascii=False, indent=1)
total_byte += os.path.getsize(daftar_path)
jumlah_berkas += 1

log(f"  {jumlah_berkas} berkas, {total_byte/1048576:.1f} MB")
log(f"  index/daftar_desa.json: {sum(len(k['desa']) for k in daftar.values())} desa")

# cek konsistensi jumlah poligon
n_asal = len(pola)
n_hasil = sum(len(v) for v in hasil_pola.values())
log(f"\ncek: {n_asal} poligon asal -> {n_hasil} potongan per desa "
    f"({100*(n_hasil-n_asal)/n_asal:+.1f}%)")
log(f"selesai dalam {time.time()-t0:.0f}s")

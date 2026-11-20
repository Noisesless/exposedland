"""Validasi independen hasil konversi GeoJSON."""
import json, os, sys, math
from collections import Counter

ROOT = r"I:\tataruang\geojson"
OK_GEOM = {"Polygon", "MultiPolygon", "LineString", "MultiLineString", "Point"}

total_fitur = 0
total_file = 0
masalah = []
tipe_geom = Counter()
semua_kec_folder = set()
properti_kunci = Counter()


def iter_coords(c):
    """yield setiap posisi koordinat"""
    if isinstance(c, list):
        if c and isinstance(c[0], (int, float)):
            yield c
        else:
            for x in c:
                yield from iter_coords(x)


def cek_ring(ring, where):
    if len(ring) < 4:
        masalah.append(f"{where}: ring hanya {len(ring)} titik")
        return
    if ring[0] != ring[-1]:
        masalah.append(f"{where}: ring tidak tertutup")


for dp, _, fs in os.walk(ROOT):
    for f in sorted(fs):
        if not f.endswith(".geojson"):
            continue
        path = os.path.join(dp, f)
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        total_file += 1
        try:
            with open(path, encoding="utf-8") as fh:
                fc = json.load(fh)
        except Exception as e:
            masalah.append(f"{rel}: JSON tidak valid ({e})")
            continue

        if fc.get("type") != "FeatureCollection":
            masalah.append(f"{rel}: bukan FeatureCollection")
        feats = fc.get("features", [])
        total_fitur += len(feats)

        folder_kec = None
        folder_desa = None
        if rel.startswith("per-kecamatan/"):
            folder_kec = rel.split("/")[1]
        elif rel.startswith("per-desa/"):
            bagian = rel.split("/")
            folder_kec, folder_desa = bagian[1], bagian[2]

        for i, ft in enumerate(feats):
            g = ft.get("geometry")
            if not g:
                masalah.append(f"{rel}#{i}: geometry null")
                continue
            gt = g.get("type")
            tipe_geom[gt] += 1
            if gt not in OK_GEOM:
                masalah.append(f"{rel}#{i}: tipe {gt}")
            coords = g.get("coordinates")
            gid = f"{rel}#{i}"
            for pos in iter_coords(coords):
                if len(pos) != 2:
                    masalah.append(f"{gid}: posisi {len(pos)} dimensi (ada Z)")
                    break
                x, y = pos
                if not (math.isfinite(x) and math.isfinite(y)):
                    masalah.append(f"{gid}: koordinat non-finite")
                    break
                if not (-180 <= x <= 180 and -90 <= y <= 90):
                    masalah.append(f"{gid}: koordinat di luar rentang: {x},{y}")
                    break
            # ring closure untuk poligon
            if gt == "Polygon":
                for r in coords:
                    cek_ring(r, gid)
            elif gt == "MultiPolygon":
                for poly in coords:
                    for r in poly:
                        cek_ring(r, gid)

            props = ft.get("properties") or {}
            for k in props:
                properti_kunci[k] += 1
            if folder_kec:
                pk = props.get("kecamatan", "")
                norm = lambda s: "".join(ch for ch in str(s).lower() if ch.isalnum())
                if norm(pk) != norm(folder_kec):
                    masalah.append(f"{gid}: kecamatan '{pk}' != folder '{folder_kec}'")
                elif folder_desa:
                    pd_ = props.get("desa", "")
                    if norm(pd_) != norm(folder_desa):
                        masalah.append(f"{gid}: desa '{pd_}' != folder '{folder_desa}'")

print(f"file        : {total_file}")
print(f"fitur       : {total_fitur:,}")
print(f"tipe geometri: {dict(tipe_geom)}")
print(f"\nproperti (jumlah fitur yang punya kunci):")
for k, v in properti_kunci.most_common():
    print(f"  {k:<22} {v:,}")

print(f"\nMASALAH: {len(masalah)}")
for m in masalah[:40]:
    print("  -", m)
if len(masalah) > 40:
    print(f"  ... dan {len(masalah)-40} lainnya")
sys.exit(1 if masalah else 0)

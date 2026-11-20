"""
Konversi data mentah SIMTARU Banjarnegara (WKT + CRS campuran) menjadi
GeoJSON bersih RFC 7946, dipecah per kecamatan.

Pipeline per layer:
  1. WKT -> shapely
  2. buang dimensi Z
  3. reproyeksi EPSG:32749 (UTM 49S) -> EPSG:4326  [hanya layer UTM]
  4. make_valid bila geometri rusak
  5. buang sliver di bawah AMBANG_M2
  6. bulatkan koordinat ke DESIMAL tempat (~0.11 m)
  7. hitung luas / panjang geodesik
  8. normalisasi nama kecamatan, split per kecamatan
"""
from __future__ import annotations

import json
import os
import re
import time
from collections import Counter, defaultdict

import numpy as np
from pyproj import Geod, Transformer
from shapely import force_2d, make_valid, transform as geom_transform, wkt as shapely_wkt
from shapely.geometry import mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

SRC = r"I:\tataruang\data"
DST = r"I:\tataruang\geojson"

T_UTM2WGS = Transformer.from_crs("EPSG:32749", "EPSG:4326", always_xy=True)
GEOD = Geod(ellps="WGS84")

AMBANG_M2 = 100.0   # sliver < 100 m2 (0.01 ha) dibuang
DESIMAL = 6         # presisi koordinat keluaran

# nama kecamatan yang salah tulis di sumber
TYPO_KEC = {
    "purwarejaklampok": "Purwareja Klampok",
    "purwareja klampok": "Purwareja Klampok",
    "purworejo klampok": "Purwareja Klampok",
}

LAYERS = {
    "pola_ruang":   ("rencana_pola_ruang.json",  False, "WADMKC"),
    "batas_desa":   ("batas_administrasi.json",  True,  "Kecamatan"),
    "transportasi": ("jaringan_transportasi.json", False, None),
    "sungai":       ("sungai_banjarnegara.json", True,  None),
}
POLIGON = {"pola_ruang", "batas_desa"}


def log(m: str) -> None:
    print(m, flush=True)


def normalisasi_kec(raw) -> str:
    """'Kec.Susukan' / 'Kecamatan Sigaluh' -> 'Susukan' / 'Sigaluh'."""
    s = str(raw or "").strip()
    if not s:
        return ""
    s = re.sub(r"^(kecamatan|kec\.?|kec)\s*", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    kunci = s.lower()
    for salah, benar in TYPO_KEC.items():
        if kunci == salah or kunci.replace(".", "") == salah.replace(".", ""):
            return benar
    return s


def slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", s.strip()).strip("-").lower()


def reproj_utm(geom):
    """Reproyeksi UTM 49S -> WGS84, vektorisasi (jauh lebih cepat dari ops.transform)."""
    return geom_transform(
        geom,
        lambda a: np.column_stack(T_UTM2WGS.transform(a[:, 0], a[:, 1])),
        include_z=False,
    )


def bulatkan_coords(c):
    if isinstance(c, (int, float)):
        v = round(float(c), DESIMAL)
        return v if v != int(v) else int(v)
    return [bulatkan_coords(x) for x in c]


def luas_m2(geom) -> float:
    return abs(GEOD.geometry_area_perimeter(geom)[0])


def panjang_m(geom) -> float:
    return abs(GEOD.geometry_length(geom))


def baca_layer(nama: str):
    fn, is_utm, kol = LAYERS[nama]
    with open(os.path.join(SRC, fn), encoding="utf-8", errors="replace") as f:
        rows = json.load(f)
    log(f"  {fn}: {len(rows)} record")

    fitur, stat = [], Counter()
    luas_dibuang = 0.0

    for row in rows:
        w = (row.get("wkt_geometry") or "").strip()
        if not w:
            stat["tanpa_geometri"] += 1
            continue
        try:
            geom = shapely_wkt.loads(w)
        except Exception:
            stat["wkt_rusak"] += 1
            continue

        if geom.has_z:
            geom = force_2d(geom)
            stat["z_dibuang"] += 1
        if is_utm:
            geom = reproj_utm(geom)
            stat["reproyeksi"] += 1
        if not geom.is_valid:
            geom = make_valid(geom)
            stat["make_valid"] += 1

        if geom.is_empty:
            stat["kosong"] += 1
            continue
        if geom.geom_type == "GeometryCollection":
            bag = [g for g in geom.geoms if g.geom_type in
                   ("Polygon", "MultiPolygon", "LineString", "MultiLineString")]
            if not bag:
                stat["tanpa_geometri"] += 1
                continue
            geom = unary_union(bag)

        props = {k: v for k, v in row.items() if k != "wkt_geometry"}
        if kol:
            props["kecamatan"] = normalisasi_kec(props.get(kol))
        fitur.append({"geom": geom, "props": props})

    if nama in POLIGON:
        sisa = []
        for f in fitur:
            a = luas_m2(f["geom"])
            if a < AMBANG_M2:
                luas_dibuang += a
                stat["sliver_dibuang"] += 1
                continue
            f["luas_m2"] = a
            sisa.append(f)
        fitur = sisa
        log(f"    -> {len(fitur)} fitur | sliver dibuang: {luas_dibuang/10000:.2f} ha")
    else:
        for f in fitur:
            f["panjang_m"] = panjang_m(f["geom"])
        log(f"    -> {len(fitur)} fitur")

    log("    " + ", ".join(f"{k}={v}" for k, v in sorted(stat.items())) if stat else "    (tanpa anomali)")
    return fitur


def tulis(path: str, fitur: list[dict]) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    feats = []
    for f in fitur:
        props = dict(f["props"])
        if "luas_m2" in f:
            props["luas_ha_geo"] = round(f["luas_m2"] / 10000.0, 4)
        if "panjang_m" in f:
            props["panjang_km_geo"] = round(f["panjang_m"] / 1000.0, 4)
        g = mapping(f["geom"])
        if g.get("coordinates"):
            g["coordinates"] = bulatkan_coords(g["coordinates"])
        feats.append({"type": "Feature", "properties": props, "geometry": g})
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": feats},
                  fh, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def main():
    os.makedirs(DST, exist_ok=True)
    t_mulai = time.time()

    log("[1/5] memuat, membersihkan, reproyeksi")
    data = {n: baca_layer(n) for n in LAYERS}

    log("[2/5] menyusun batas kecamatan")
    per_kec_desa = defaultdict(list)
    for f in data["batas_desa"]:
        per_kec_desa[f["props"]["kecamatan"]].append(f["geom"])
    batas_kec = {}
    for kec, gs in per_kec_desa.items():
        u = unary_union(gs)
        if u.geom_type == "GeometryCollection":
            u = unary_union([g for g in u.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
        batas_kec[kec] = u
    kunci = sorted(batas_kec)
    log(f"  {len(kunci)} kecamatan: {', '.join(kunci)}")

    # cek: apakah nama kecamatan di pola_ruang & batas_desa benar-benar sama?
    set_pola = {f["props"].get("kecamatan") for f in data["pola_ruang"]}
    selisih = set_pola - set(kunci)
    log(f"  kecamatan pola_ruang tidak dikenal di batas desa: {selisih or 'tidak ada'}")
    if selisih:
        raise SystemExit("GAGAL: nama kecamatan tidak konsisten, split akan salah.")

    log("[3/5] menetapkan kecamatan untuk layer garis")
    pohon = STRtree([batas_kec[k] for k in kunci])
    garis_full = {}
    garis_split = {}

    for nama in ("transportasi", "sungai"):
        split = defaultdict(list)
        full = []
        tanpa = 0
        for f in data[nama]:
            g = f["geom"]
            idx = pohon.query(g)
            if len(idx) == 0:
                j = pohon.nearest(g)
                idx = [j] if j is not None else []
                if len(idx):
                    tanpa += 1
            if len(idx) == 0:
                tanpa += 1
                continue
            idx = [int(i) for i in np.atleast_1d(idx)]

            # -- geometri penuh: diberi satu kecamatan dengan tumpang-susun terpanjang
            if len(idx) == 1:
                terpilih = kunci[idx[0]]
            else:
                terpanjang = (-1.0, kunci[idx[0]])
                for i in idx:
                    bagian = g.intersection(batas_kec[kunci[i]])
                    if not bagian.is_empty and bagian.geom_type in ("LineString", "MultiLineString"):
                        L = panjang_m(bagian)
                        if L > terpanjang[0]:
                            terpanjang = (L, kunci[i])
                terpilih = terpanjang[1]
            p = dict(f["props"]); p["kecamatan"] = terpilih
            full.append({"geom": g, "props": p, "panjang_m": f["panjang_m"]})

            # -- versi per kecamatan: dipotong batas kecamatan
            if len(idx) == 1:
                split[terpilih].append({"geom": g, "props": p, "panjang_m": f["panjang_m"]})
            else:
                for i in idx:
                    kec = kunci[i]
                    try:
                        potong = g.intersection(batas_kec[kec])
                    except Exception:
                        continue
                    if potong.is_empty or potong.geom_type not in (
                            "LineString", "MultiLineString", "Polygon", "MultiPolygon"):
                        continue
                    pp = dict(f["props"]); pp["kecamatan"] = kec
                    split[kec].append({"geom": potong, "props": pp,
                                       "panjang_m": panjang_m(potong)})
        garis_full[nama] = full
        garis_split[nama] = split
        log(f"  {nama}: penuh={len(full)}, potongan={sum(len(v) for v in split.values())}, "
            f"tanpa-kecamatan={tanpa}")

    # kumpulkan semua fitur per kecamatan
    per_kec = defaultdict(lambda: defaultdict(list))
    for f in data["pola_ruang"]:
        per_kec[f["props"]["kecamatan"]]["pola_ruang"].append(f)
    for f in data["batas_desa"]:
        per_kec[f["props"]["kecamatan"]]["batas_desa"].append(f)
    for nama in ("transportasi", "sungai"):
        for kec, fs in garis_split[nama].items():
            per_kec[kec][nama].extend(fs)

    log("[4/5] menulis GeoJSON")
    manifest = {
        "sumber": "https://simtaru.banjarnegarakab.go.id/json/",
        "crs_keluaran": "EPSG:4326 (WGS84)",
        "crs_sumber": {"pola_ruang": "EPSG:4326", "batas_desa": "EPSG:32749",
                       "transportasi": "EPSG:4326", "sungai": "EPSG:32749"},
        "dibuat": time.strftime("%Y-%m-%d %H:%M:%S"),
        "ambang_sliver_m2": AMBANG_M2,
        "desimal_koordinat": DESIMAL,
        "layers": {},
        "kecamatan": {},
    }

    for nama in LAYERS:
        # layer garis memakai versi penuh yang sudah diberi atribut kecamatan
        fitur = garis_full[nama] if nama in garis_full else data[nama]
        p = os.path.join(DST, "full", f"{nama}.geojson")
        sz = tulis(p, fitur)
        manifest["layers"][nama] = {
            "file": f"full/{nama}.geojson", "fitur": len(fitur),
            "ukuran_mb": round(sz / 1048576, 2),
            "total_ha": round(sum(f["luas_m2"] for f in fitur) / 10000, 2) if nama in POLIGON else None,
        }
        log(f"  full/{nama}.geojson  {len(fitur):>6} fitur  {sz/1048576:>6.2f} MB")

    for kec in kunci:
        sl = slug(kec)
        folder = os.path.join(DST, "per-kecamatan", sl)
        info = {"nama": kec, "slug": sl, "layers": {}, "luas_ha": {}}
        for nama in LAYERS:
            fs = per_kec.get(kec, {}).get(nama, [])
            if not fs:
                continue
            p = os.path.join(folder, f"{nama}.geojson")
            sz = tulis(p, fs)
            info["layers"][nama] = {"file": f"{sl}/{nama}.geojson", "fitur": len(fs),
                                    "ukuran_mb": round(sz / 1048576, 3)}
            if nama in POLIGON:
                info["luas_ha"][nama] = round(sum(f["luas_m2"] for f in fs) / 10000, 2)
        info["total_mb"] = round(sum(v["ukuran_mb"] for v in info["layers"].values()), 2)
        manifest["kecamatan"][sl] = info
        log(f"  {kec:<20} {info['total_mb']:>6.2f} MB  " +
            " ".join(f"{k}={v['fitur']}" for k, v in info["layers"].items()))

    with open(os.path.join(DST, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    # ---------- 4c. layer indeks untuk initial load ----------
    log("  indeks (batas kecamatan + daftar)")
    idx_dir = os.path.join(DST, "index")

    # batas kecamatan hasil dissolve desa -> ringan untuk tampilan awal
    fitur_kec = []
    for kec in kunci:
        fitur_kec.append({
            "geom": batas_kec[kec],
            "props": {"kecamatan": kec, "slug": slug(kec)},
            "luas_m2": luas_m2(batas_kec[kec]),
        })
    sz = tulis(os.path.join(idx_dir, "batas_kecamatan.geojson"), fitur_kec)
    log(f"  index/batas_kecamatan.geojson  {len(fitur_kec)} fitur  {sz/1048576:.2f} MB")

    # daftar kecamatan + bbox + centroid, agar app bisa memuat per wilayah
    daftar = []
    for kec in kunci:
        c = batas_kec[kec].centroid
        minx, miny, maxx, maxy = batas_kec[kec].bounds
        daftar.append({
            "nama": kec, "slug": slug(kec),
            "luas_ha": round(luas_m2(batas_kec[kec]) / 10000, 2),
            "jumlah_desa": len(per_kec_desa[kec]),
            "centroid": [round(c.x, 6), round(c.y, 6)],
            "bbox": [round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)],
            "layers": {k: v["file"] for k, v in manifest["kecamatan"][slug(kec)]["layers"].items()},
        })
    with open(os.path.join(idx_dir, "daftar_kecamatan.json"), "w", encoding="utf-8") as fh:
        json.dump({"kabupaten": "Banjarnegara", "jumlah": len(daftar), "kecamatan": daftar},
                  fh, ensure_ascii=False, indent=2)
    log(f"  index/daftar_kecamatan.json  {len(daftar)} kecamatan")

    # ---------- 5. verifikasi ----------
    log("[5/5] verifikasi")
    masalah = []

    # a) jumlah fitur per kecamatan harus sama dengan versi penuh
    for nama in ("pola_ruang", "batas_desa"):
        n_full = len(data[nama])
        n_split = sum(len(per_kec.get(k, {}).get(nama, [])) for k in kunci)
        ok = n_full == n_split
        log(f"  {nama}: full={n_full} split={n_split} {'OK' if ok else 'BEDA'}")
        if not ok:
            masalah.append(f"{nama}: {n_full} vs {n_split}")

    # b) luas per layer harus konsisten antara versi penuh dan per kecamatan
    for nama in POLIGON:
        tot_full = sum(f["luas_m2"] for f in data[nama]) / 10000
        tot_split = sum(v["luas_ha"].get(nama, 0.0) for v in manifest["kecamatan"].values())
        beda = abs(tot_full - tot_split)
        ok = beda < 0.5
        log(f"  luas {nama}: penuh={tot_full:,.2f} ha  per-kec={tot_split:,.2f} ha  "
            f"selisih={beda:.4f} ha {'OK' if ok else 'BEDA'}")
        if not ok:
            masalah.append(f"{nama}: luas {tot_full:.2f} vs {tot_split:.2f}")

    # b2) bandingkan luas geodesik dengan atribut LUASHA bawaan sumber
    for nama in POLIGON:
        tot_geo = sum(f["luas_m2"] for f in data[nama]) / 10000
        tot_attr = sum((f["props"].get("LUASHA") or 0) for f in data[nama])
        if tot_attr:
            log(f"  {nama}: LUASHA sumber={tot_attr:,.2f} ha vs geodesik={tot_geo:,.2f} ha "
                f"(atribut {100*(tot_attr-tot_geo)/tot_geo:+.2f}%)")

    # b3) keselarasan batas: luas pola ruang harus mendekati luas administrasi
    a_pola = sum(f["luas_m2"] for f in data["pola_ruang"]) / 10000
    a_adm = sum(f["luas_m2"] for f in data["batas_desa"]) / 10000
    log(f"  luas wilayah: pola_ruang={a_pola:,.2f} ha vs batas_desa={a_adm:,.2f} ha "
        f"(selisih {a_pola-a_adm:+,.2f} ha / {100*(a_pola-a_adm)/a_adm:+.3f}%)")

    # c) sanity bbox: semua koordinat harus di dalam Jawa Tengah
    for nama in LAYERS:
        xs, ys = [], []
        for f in data[nama][:400]:
            b = f["geom"].bounds
            xs += [b[0], b[2]]; ys += [b[1], b[3]]
        if xs:
            log(f"  bbox {nama}: X {min(xs):.4f}..{max(xs):.4f}  Y {min(ys):.4f}..{max(ys):.4f}")
            if not (108 < min(xs) and max(xs) < 111 and -8.5 < min(ys) and max(ys) < -6.5):
                masalah.append(f"{nama}: bbox di luar Jawa Tengah")

    if masalah:
        log("  MASALAH: " + "; ".join(masalah))
    else:
        log("  semua pemeriksaan lolos")

    total = sum(os.path.getsize(os.path.join(dp, f))
                for dp, _, fs in os.walk(DST) for f in fs)
    log(f"\nSELESAI dalam {time.time()-t_mulai:.0f}s. "
        f"{len(kunci)} kecamatan, total {total/1048576:.1f} MB -> {DST}")


if __name__ == "__main__":
    main()

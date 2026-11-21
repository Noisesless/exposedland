"""
Ekstrak Persil Satelit 2026 — Master CLI
Pipeline ekstraksi poligon persil bangunan kadaster resolusi tinggi dari ubin Google Maps Satelit 2026.
Mendukung pemrosesan per-kecamatan untuk seluruh 20 kecamatan di Kabupaten Banjarnegara.

Penggunaan:
  python tools/ekstrak_persil.py --kecamatan banjarnegara --zoom 18
  python tools/ekstrak_persil.py --kecamatan batur --zoom 18
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
import numpy as np
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
from scipy import ndimage

# Tambahkan direktori root ke sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from tools.kadaster_extractor.tile_fetcher import fetch_kecamatan_tiles
from tools.kadaster_extractor.tile_stitcher import stitch_tile_patch
from tools.kadaster_extractor.detector import extract_building_binary_mask, segment_building_instances
from tools.kadaster_extractor.regularizer import instance_to_geopolygon, DesaClassifier

def run_extraction(kecamatan_slug: str = "banjarnegara", zoom: int = 18, patch_size: int = 8, output_path: str = None):
    start_time = time.time()
    kec_dir = BASE_DIR / "geojson" / "per-kecamatan" / kecamatan_slug
    batas_file = kec_dir / "batas_desa.geojson"

    if not batas_file.exists():
        print(f"[ERROR] Berkas batas wilayah tidak ditemukan: {batas_file}")
        sys.exit(1)

    print("=" * 72)
    print(f"  EKSTRAKSI PERSIL BANGUNAN KADASTER SATELIT 2026")
    print(f"  Target Wilayah: Kecamatan {kecamatan_slug.upper()} | Zoom Level: {zoom}")
    print("=" * 72)

    # 1. Pemuatan Batas Administrasi
    with open(batas_file, "r", encoding="utf-8") as f:
        batas_data = json.load(f)

    desa_features = batas_data.get("features", [])
    union_boundary = unary_union([shape(f["geometry"]) for f in desa_features])
    desa_classifier = DesaClassifier(desa_features)
    print(f"Batas wilayah dimuat: {len(desa_features)} Desa/Kelurahan.")

    # 2. Pengunduhan & Sinkronisasi Ubin Satelit
    tiles, (x_min, x_max, y_min, y_max), cache_dir = fetch_kecamatan_tiles(
        kecamatan_slug, union_boundary, zoom=zoom, base_cache_dir=str(BASE_DIR / "tools" / "cache_sat_tiles")
    )

    # 3. Pemrosesan Sub-Patch Berjenjang (Memory-Safe Chunking)
    all_polys = []
    total_patches_x = (x_max - x_min) // patch_size + 1
    total_patches_y = (y_max - y_min) // patch_size + 1
    total_patches = total_patches_x * total_patches_y
    processed_patches = 0

    print(f"Membagi area menjadi {total_patches} blok patch ({patch_size}x{patch_size} ubin)...")

    for px_idx in range(total_patches_x):
        for py_idx in range(total_patches_y):
            cur_x_start = x_min + px_idx * patch_size
            cur_x_end = min(x_max, cur_x_start + patch_size - 1)
            cur_y_start = y_min + py_idx * patch_size
            cur_y_end = min(y_max, cur_y_start + patch_size - 1)

            # Cek apakah blok beririsan dengan batas kecamatan
            from tools.kadaster_extractor.tile_fetcher import num2deg
            lat_top, lon_left = num2deg(cur_x_start, cur_y_start, zoom)
            lat_bottom, lon_right = num2deg(cur_x_end + 1, cur_y_end + 1, zoom)
            patch_box = box(lon_left, lat_bottom, lon_right, lat_top)

            processed_patches += 1
            if not union_boundary.intersects(patch_box):
                continue

            # Jahit ubin untuk patch ini
            patch = stitch_tile_patch(cur_x_start, cur_x_end, cur_y_start, cur_y_end, zoom, cache_dir)
            if patch.image.size == 0 or np.all(patch.image == 0):
                continue

            # Deteksi atap dan pemisahan unit persil bangunan individual
            mask = extract_building_binary_mask(patch.image)
            labels, num_instances = segment_building_instances(mask)
            if num_instances == 0:
                continue

            slices = ndimage.find_objects(labels)
            for i, sl in enumerate(slices):
                if sl is None:
                    continue
                lbl = i + 1
                comp = (labels[sl] == lbl)
                if np.sum(comp) < 16:
                    continue
                res = instance_to_geopolygon(comp, sl[0].start, sl[1].start, patch)
                if res:
                    poly, area_m2, geom_type = res
                    if union_boundary.contains(poly.centroid):
                        all_polys.append((poly, area_m2, geom_type))

    print(f"Total poligon persil terdeteksi: {len(all_polys):,} unit.")

    # 4. Deduplikasi Spasial (Menghilangkan poligon ganda di batas patch)
    print("Menjalankan deduplikasi spasial dan pembersihan tumpang-tindih...")
    final_features = []
    box_count = 0
    ortho_count = 0

    if all_polys:
        geoms = [p[0] for p in all_polys]
        areas = [p[1] for p in all_polys]
        gtypes = [p[2] for p in all_polys]
        tree = STRtree(geoms)
        visited = set()

        bldg_id = 1
        for i, poly in enumerate(geoms):
            if i in visited:
                continue

            visited.add(i)
            # Cek poligon tetangga yang overlap > 50%
            cands = tree.query(poly)
            is_dup = False
            for c_idx in cands:
                if c_idx != i and c_idx in visited:
                    try:
                        inter = poly.intersection(geoms[c_idx]).area
                        if inter / min(poly.area, geoms[c_idx].area) > 0.50:
                            is_dup = True
                            break
                    except Exception:
                        pass

            if is_dup:
                continue

            area_val = round(areas[i], 1)
            desa_name = desa_classifier.classify_building(poly)
            floors = 1 if area_val <= 85 else (2 if area_val <= 250 else 3)
            shape_t = gtypes[i]
            if shape_t == "box":
                box_count += 1
            else:
                ortho_count += 1

            feat = {
                "type": "Feature",
                "geometry": mapping(poly),
                "properties": {
                    "id": f"SAT26-{kecamatan_slug[:3].upper()}-{bldg_id:06d}",
                    "name": f"Persil {desa_name} #{bldg_id}",
                    "type": "building",
                    "desa": desa_name,
                    "kecamatan": kecamatan_slug.capitalize(),
                    "area_m2": area_val,
                    "est_floors": floors,
                    "shape_type": shape_t,
                    "sumber": "Google Maps Satellite HD 2026 AI Extraction (Orthogonal Regularized)"
                }
            }
            final_features.append(feat)
            bldg_id += 1

    # 5. Ekspor GeoJSON
    if not output_path:
        out_dir = BASE_DIR / "web" / "data"
        out_dir.mkdir(parents=True, exist_ok=True)
        output_path = out_dir / f"{kecamatan_slug}_buildings_satelit_2026.geojson"
    else:
        output_path = Path(output_path)

    out_geojson = {
        "type": "FeatureCollection",
        "name": f"persil_bangunan_{kecamatan_slug}_satelit_2026",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
        },
        "features": final_features
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, ensure_ascii=False)

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    duration = time.time() - start_time

    total_units = len(final_features)
    pct_box = (box_count / total_units * 100.0) if total_units > 0 else 0
    pct_ortho = (ortho_count / total_units * 100.0) if total_units > 0 else 0

    print("=" * 72)
    print(f"  EKSTRAKSI SELESAI ({duration:.1f} detik)")
    print(f"  Jumlah Persil Bersih   : {total_units:,} unit poligon")
    print(f"  - Persegi / Kotak (OBB): {box_count:,} unit ({pct_box:.1f}%)")
    print(f"  - Majemuk Ortogonal 90°: {ortho_count:,} unit ({pct_ortho:.1f}%)")
    print(f"  Berkas Luaran GeoJSON  : {output_path}")
    print(f"  Ukuran Berkas          : {file_size_mb:.2f} MB")
    print("=" * 72)

    return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ekstrak poligon persil bangunan kadaster dari Google Maps Satelit 2026.")
    parser.add_argument("--kecamatan", type=str, default="banjarnegara", help="Slug nama kecamatan (contoh: banjarnegara, batur, sigaluh)")
    parser.add_argument("--zoom", type=int, default=18, help="Zoom level ubin satelit (default: 18)")
    parser.add_argument("--patch-size", type=int, default=8, help="Ukuran blok sub-patch ubin (default: 8)")
    parser.add_argument("--output", type=str, default=None, help="Lokasi simpan file GeoJSON luaran")

    args = parser.parse_args()
    run_extraction(kecamatan_slug=args.kecamatan, zoom=args.zoom, patch_size=args.patch_size, output_path=args.output)

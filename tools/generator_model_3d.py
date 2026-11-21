#!/usr/bin/env python3
"""
Generator Model 3D Kabupaten Banjarnegara
===========================================
Menghasilkan:
1. Solid watertight 3D manifold (.stl & .obj) siap cetak 3D
2. WebGL terrain data (.json) untuk web viewer Three.js
3. Tekstur Topografi (shaded relief), Citra Satelit, dan Pola Ruang RTRW
4. Fitur overlay 3D (batas kecamatan, sungai, landmark)
"""

import os
import sys
import math
import json
import time
import argparse
import urllib.request
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import shape, box, Point, LineString, MultiLineString
from shapely.ops import unary_union
from scipy.ndimage import map_coordinates
import mapbox_earcut
import trimesh

# URL tile providers
MAPTERHORN_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"
ESRI_SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

PALET_POLA = {
    '31010000': (47, 124, 184),   # Badan Air
    '31021000': (28, 94, 58),    # Kawasan Hutan Lindung
    '31041100': (13, 63, 40),    # Cagar Alam
    '31071100': (138, 98, 56),   # Kawasan Keunikan Batuan dan Fosil
    '31080000': (156, 84, 136),  # Kawasan Cagar Budaya
    '32021000': (63, 122, 70),   # Kawasan Hutan Produksi Tetap
    '32022000': (95, 145, 80),   # Kawasan Hutan Produksi Terbatas
    '32041000': (232, 201, 63),  # Kawasan Tanaman Pangan
    '32042000': (195, 212, 112), # Kawasan Hortikultura
    '32043000': (169, 138, 201), # Kawasan Perkebunan
    '32080000': (123, 135, 148), # Kawasan Peruntukan Industri
    '32101000': (192, 57, 43),   # Kawasan Permukiman Perkotaan
    '32102000': (226, 144, 95),  # Kawasan Permukiman Perdesaan
}

LANDMARKS = [
    {"nama": "Dataran Tinggi Dieng", "kategori": "Wisata & Vulkanik", "lon": 109.9052, "lat": -7.2144, "deskripsi": "Kawasan vulkanik aktif & candi Hindu kuno"},
    {"nama": "Gunung Prau", "kategori": "Puncak Tertinggi", "lon": 109.9197, "lat": -7.1895, "deskripsi": "Titik tertinggi Banjarnegara (2.565 mdpl)"},
    {"nama": "Waduk Mrica (Soedirman)", "kategori": "Infrastruktur Air", "lon": 109.6450, "lat": -7.4250, "deskripsi": "Waduk PLTA terbesar di Jawa Tengah"},
    {"nama": "Alun-Alun Banjarnegara", "kategori": "Pusat Kota", "lon": 109.6973, "lat": -7.3976, "deskripsi": "Ibukota & pusat pemerintahan"},
    {"nama": "Klampok (Lembah Serayu)", "kategori": "Sentra Keramik", "lon": 109.4350, "lat": -7.4580, "deskripsi": "Titik terendah Banjarnegara (44 mdpl)"},
    {"nama": "Batur", "kategori": "Sentra Pertanian", "lon": 109.8400, "lat": -7.2100, "deskripsi": "Kawasan pertanian hortikultura & sayuran"},
    {"nama": "Curug Pitu", "kategori": "Air Terjun", "lon": 109.6920, "lat": -7.3320, "deskripsi": "Air terjun berundak tujuh di Sigaluh"},
    {"nama": "Karangkobar", "kategori": "Pusat Utara", "lon": 109.7200, "lat": -7.2800, "deskripsi": "Pusat perdagangan lereng utara"}
]

def num2deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)

def download_tiles(zoom, xs, ys, url_template, cache_dir, ext="webp", headers=None):
    os.makedirs(cache_dir, exist_ok=True)
    if headers is None:
        headers = {"User-Agent": "Mozilla/5.0"}
    for x in xs:
        for y in ys:
            fpath = os.path.join(cache_dir, f"{zoom}_{x}_{y}.{ext}")
            if not os.path.exists(fpath):
                url = url_template.format(z=zoom, x=x, y=y)
                req = urllib.request.Request(url, headers=headers)
                try:
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        with open(fpath, "wb") as f:
                            f.write(resp.read())
                except Exception as e:
                    print(f"Warning download {url}: {e}")

def build_elevation_grid(xs, ys, zoom, cache_dir):
    tile_size = 512
    full_w = len(xs) * tile_size
    full_h = len(ys) * tile_size
    elev_grid = np.zeros((full_h, full_w), dtype=np.float32)

    for c_idx, x in enumerate(xs):
        for r_idx, y in enumerate(ys):
            fpath = os.path.join(cache_dir, f"{zoom}_{x}_{y}.webp")
            if os.path.exists(fpath):
                img = Image.open(fpath).convert("RGB")
                arr = np.array(img, dtype=np.float32)
                e = (arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0) - 32768.0
                elev_grid[r_idx*tile_size:(r_idx+1)*tile_size, c_idx*tile_size:(c_idx+1)*tile_size] = e
    return elev_grid

def main():
    parser = argparse.ArgumentParser(description="Generator Model 3D Banjarnegara")
    parser.add_argument("--nx", type=int, default=140, help="Grid X resolution")
    parser.add_argument("--ny", type=int, default=95, help="Grid Y resolution")
    parser.add_argument("--exaggeration", type=float, default=1.8, help="Z height exaggeration multiplier")
    parser.add_argument("--base-mm", type=float, default=3.0, help="Base thickness in mm for 3D printing")
    parser.add_argument("--print-size-mm", type=float, default=160.0, help="Target largest side for 3D print in mm")
    parser.add_argument("--out-dir", type=str, default="web/data", help="Output directory")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    cache_dem = "tools/cache_dem"
    cache_sat = "tools/cache_sat/z12"

    print("=== 1. MEMUAT POLIGON BATAS KABUPATEN BANJARNEGARA ===")
    with open("geojson/index/batas_kecamatan.geojson", "r", encoding="utf-8") as f:
        fc_kec = json.load(f)
    kab_full = unary_union([shape(feat["geometry"]) for feat in fc_kec["features"]])
    # Sederhanakan batas luar sedikit untuk kehalusan tepi mesh solid
    kab_poly = kab_full.simplify(0.0004, preserve_topology=True)
    min_lon, min_lat, max_lon, max_lat = kab_poly.bounds
    center_lon = (min_lon + max_lon) / 2.0
    center_lat = (min_lat + max_lat) / 2.0
    print(f"BBox: Lon [{min_lon:.4f}, {max_lon:.4f}], Lat [{min_lat:.4f}, {max_lat:.4f}]")
    print(f"Centroid: Lon {center_lon:.4f}, Lat {center_lat:.4f}")

    # Tile index zoom 11
    dem_zoom = 11
    xs_dem = list(range(1646, 1650))
    ys_dem = list(range(1064, 1068))
    nw_lat, nw_lon = num2deg(xs_dem[0], ys_dem[0], dem_zoom)
    se_lat, se_lon = num2deg(xs_dem[-1] + 1, ys_dem[-1] + 1, dem_zoom)

    print("\n=== 2. MENGUNDUH & MEMPROSES DEM ELEVASI ===")
    download_tiles(dem_zoom, xs_dem, ys_dem, MAPTERHORN_URL, cache_dem, ext="webp")
    elev_grid = build_elevation_grid(xs_dem, ys_dem, dem_zoom, cache_dem)
    grid_h, grid_w = elev_grid.shape

    def sample_elev(lons, lats):
        c = (lons - nw_lon) / (se_lon - nw_lon) * (grid_w - 1)
        r = (nw_lat - lats) / (nw_lat - se_lat) * (grid_h - 1)
        coords = np.vstack([r, c])
        return map_coordinates(elev_grid, coords, order=1, mode="nearest")

    # Hitung elevasi di dalam poligon Banjarnegara
    sample_xs = np.linspace(min_lon, max_lon, 100)
    sample_ys = np.linspace(min_lat, max_lat, 80)
    in_elevs = []
    for x in sample_xs:
        for y in sample_ys:
            if kab_poly.contains(Point(x, y)):
                in_elevs.append(float(sample_elev(np.array([x]), np.array([y]))[0]))
    in_elevs = np.array(in_elevs)
    min_elev = float(in_elevs.min())
    max_elev = float(in_elevs.max())
    mean_elev = float(in_elevs.mean())
    print(f"Statistik Elevasi Banjarnegara: Min={min_elev:.1f}m, Max={max_elev:.1f}m, Rata-rata={mean_elev:.1f}m")

    print("\n=== 3. MENGHASILKAN TEKSTUR TOPOGRAFI (SHADED RELIEF) ===")
    # 3.A Topographic Shaded Relief
    pixel_scale = 76.0
    dy, dx = np.gradient(elev_grid, pixel_scale)
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dy, dx)
    azimuth_rad = math.radians(315.0)
    alt_rad = math.radians(45.0)
    hillshade = np.sin(alt_rad) * np.cos(slope) + np.cos(alt_rad) * np.sin(slope) * np.cos(azimuth_rad - aspect)
    hillshade = np.clip((hillshade + 1.0) / 2.0, 0.4, 1.0)

    # Color ramp topografi
    # <100m: lembah subur (hijau) -> 300m -> 700m -> 1200m -> 1800m -> >2200m (puncak dieng abu-abu/putih)
    elev_norm = np.clip((elev_grid - 40.0) / 2500.0, 0.0, 1.0)
    topo_rgb = np.zeros((grid_h, grid_w, 3), dtype=np.uint8)

    # Colormap ramp
    stops = [
        (0.00, np.array([74, 222, 128])),   # #4ade80 soft green
        (0.12, np.array([163, 230, 53])),   # #a3e635 light green
        (0.25, np.array([250, 204, 21])),   # #facc15 yellow
        (0.45, np.array([234, 88, 12])),    # #ea580c terracotta
        (0.70, np.array([133, 77, 14])),    # #854d0e mountain brown
        (0.85, np.array([156, 163, 175])),  # #9ca3af slate
        (1.00, np.array([255, 255, 255]))   # #ffffff peak white
    ]
    for i in range(len(stops) - 1):
        t0, c0 = stops[i]
        t1, c1 = stops[i+1]
        mask = (elev_norm >= t0) & (elev_norm <= t1)
        factor = (elev_norm[mask] - t0) / (t1 - t0)
        for ch in range(3):
            val = c0[ch] + factor * (c1[ch] - c0[ch])
            val = val * hillshade[mask]
            topo_rgb[mask, ch] = np.clip(val, 0, 255).astype(np.uint8)

    topo_img = Image.fromarray(topo_rgb)
    topo_path = os.path.join(args.out_dir, "texture_topo.png")
    topo_img.save(topo_path)
    print(f"Tekstur Topografi tersimpan: {topo_path} ({topo_img.size})")

    print("\n=== 4. MENGHASILKAN TEKSTUR CITRA SATELIT ===")
    sat_zoom = 12
    xs_sat = list(range(1646 * 2, 1650 * 2))
    ys_sat = list(range(1064 * 2, 1068 * 2))
    download_tiles(sat_zoom, xs_sat, ys_sat, ESRI_SAT_URL, cache_sat, ext="jpg")
    sat_tile_size = 256
    sat_img = Image.new("RGB", (len(xs_sat) * sat_tile_size, len(ys_sat) * sat_tile_size))
    for c_idx, x in enumerate(xs_sat):
        for r_idx, y in enumerate(ys_sat):
            fpath = os.path.join(cache_sat, f"{sat_zoom}_{x}_{y}.jpg")
            if os.path.exists(fpath):
                tile = Image.open(fpath)
                sat_img.paste(tile, (c_idx * sat_tile_size, r_idx * sat_tile_size))
    sat_path = os.path.join(args.out_dir, "texture_satelit.jpg")
    sat_img.save(sat_path, quality=90)
    print(f"Tekstur Citra Satelit tersimpan: {sat_path} ({sat_img.size})")

    print("\n=== 5. MENGHASILKAN TEKSTUR POLA RUANG RTRW ===")
    pola_img = Image.new("RGB", (grid_w, grid_h), (245, 240, 239))
    draw_pola = ImageDraw.Draw(pola_img)
    with open("geojson/index/kab_pola_ruang.geojson", "r", encoding="utf-8") as f:
        fc_pola = json.load(f)

    def to_px(lon, lat):
        px = int((lon - nw_lon) / (se_lon - nw_lon) * grid_w)
        py = int((nw_lat - lat) / (nw_lat - se_lat) * grid_h)
        return px, py

    for feat in fc_pola["features"]:
        kod = feat["properties"].get("KODKWS", "")
        col = PALET_POLA.get(kod, (154, 160, 166))
        geom = feat["geometry"]
        gtype = geom["type"]
        coords_list = [geom["coordinates"]] if gtype == "Polygon" else geom["coordinates"]
        for poly in coords_list:
            ring = poly[0]
            pts = [to_px(pt[0], pt[1]) for pt in ring]
            if len(pts) >= 3:
                draw_pola.polygon(pts, fill=col)

    # Tambahkan sedikit hillshade transparan di atas pola ruang agar timbul
    pola_arr = np.array(pola_img, dtype=np.float32)
    for ch in range(3):
        pola_arr[:, :, ch] = np.clip(pola_arr[:, :, ch] * hillshade, 0, 255)
    pola_final = Image.fromarray(pola_arr.astype(np.uint8))
    pola_path = os.path.join(args.out_dir, "texture_polaruang.png")
    pola_final.save(pola_path)
    print(f"Tekstur Pola Ruang tersimpan: {pola_path} ({pola_final.size})")

    print("\n=== 6. MEMBANGUN MESH 3D TERRAIN & SOLID SKIRT ===")
    nx, ny = args.nx, args.ny
    gx = np.linspace(min_lon, max_lon, nx)
    gy = np.linspace(min_lat, max_lat, ny)

    all_verts, all_faces = [], []
    v_offset = 0

    t0 = time.time()
    for i in range(nx - 1):
        for j in range(ny - 1):
            cell = box(gx[i], gy[j], gx[i+1], gy[j+1])
            if not kab_poly.intersects(cell):
                continue
            p = cell if kab_poly.contains(cell) else kab_poly.intersection(cell)
            if p.is_empty:
                continue
            subpolys = [p] if p.geom_type == "Polygon" else list(p.geoms)
            for sp in subpolys:
                coords = np.array(sp.exterior.coords[:-1], dtype=np.float64)
                if len(coords) < 3:
                    continue
                rings = np.array([len(coords)], dtype=np.uint32)
                indices = mapbox_earcut.triangulate_float64(coords, rings)
                if len(indices) == 0:
                    continue
                verts3d = np.column_stack([coords, np.zeros(len(coords))])
                all_verts.append(verts3d)
                all_faces.append(indices.reshape(-1, 3) + v_offset)
                v_offset += len(coords)

    V_top = np.vstack(all_verts)
    F_top = np.vstack(all_faces)
    top_mesh = trimesh.Trimesh(vertices=V_top, faces=F_top, process=True)

    # Sample elevasi aktual untuk setiap vertex top_mesh
    lons = top_mesh.vertices[:, 0]
    lats = top_mesh.vertices[:, 1]
    elevs_actual = sample_elev(lons, lats)

    # Konversi koordinat geodetik ke koordinat planar meter lokal
    # Centroid sebagai (0, 0)
    cos_lat = math.cos(math.radians(center_lat))
    x_meters = (lons - center_lon) * cos_lat * 111319.5
    y_meters = (lats - center_lat) * 111319.5

    # Web UVs [0..1]
    u_coords = (lons - nw_lon) / (se_lon - nw_lon)
    # Texture V: 0 di bawah (South), 1 di atas (North) untuk WebGL standard
    v_coords = (lats - se_lat) / (nw_lat - se_lat)
    uv_coords = np.column_stack([u_coords, v_coords])

    # Ketinggian relatif dan dasar plinth (base)
    # min_elev dijadikan referensi dasar
    z_relative = (elevs_actual - min_elev)

    # Untuk 3D print:
    # Skala planar ke target print size (default 160 mm lebar)
    width_m = (max_lon - min_lon) * cos_lat * 111319.5
    height_m = (max_lat - min_lat) * 111319.5
    print_scale = args.print_size_mm / max(width_m, height_m)

    # Z dasar untuk solid plinth (3mm di bawah titik terendah)
    z_base_print = - (args.base_mm / (print_scale * args.exaggeration))

    # Tentukan orientasi batas atas mesh untuk membuat skirt
    edge_dict = {}
    for face in top_mesh.faces:
        for i in range(3):
            e = (face[i], face[(i+1)%3])
            rev = (face[(i+1)%3], face[i])
            edge_dict[e] = edge_dict.get(e, 0) + 1
            edge_dict[rev] = edge_dict.get(rev, 0) - 1

    boundary_directed = [e for e, count in edge_dict.items() if count == 1]
    print(f"Mesh atas: {len(top_mesh.vertices)} vertex, {len(top_mesh.faces)} segitiga, {len(boundary_directed)} tepi batas")

    # Bangun solid mesh untuk 3D printing (.stl)
    n_top = len(top_mesh.vertices)
    print_top_v = np.column_stack([
        x_meters * print_scale,
        y_meters * print_scale,
        (z_relative * args.exaggeration + (args.base_mm / print_scale)) * print_scale
    ])
    # Dasar plinth datar di Z = 0
    print_bottom_v = print_top_v.copy()
    print_bottom_v[:, 2] = 0.0

    print_bottom_faces = top_mesh.faces[:, [0, 2, 1]] + n_top
    skirt_faces = []
    for v1, v2 in boundary_directed:
        b1 = v1 + n_top
        b2 = v2 + n_top
        skirt_faces.append([v1, b1, b2])
        skirt_faces.append([v1, b2, v2])

    solid_vertices = np.vstack([print_top_v, print_bottom_v])
    solid_faces = np.vstack([top_mesh.faces, print_bottom_faces, np.array(skirt_faces)])
    solid_mesh = trimesh.Trimesh(vertices=solid_vertices, faces=solid_faces, process=True)

    print(f"Solid Manifold Mesh: Watertight={solid_mesh.is_watertight}, Volume={solid_mesh.volume:.1f} mm³")

    # Ekspor STL
    stl_path = os.path.join(args.out_dir, "banjarnegara_3d.stl")
    solid_mesh.export(stl_path, file_type="stl")
    print(f"File STL 3D Print tersimpan: {stl_path} ({os.path.getsize(stl_path):,} bytes)")

    # Ekspor OBJ & MTL
    obj_path = os.path.join(args.out_dir, "banjarnegara_3d.obj")
    mtl_path = os.path.join(args.out_dir, "banjarnegara_3d.mtl")
    with open(mtl_path, "w", encoding="utf-8") as f:
        f.write("# Banjarnegara 3D Material\n")
        f.write("newmtl Material_Topografi\n")
        f.write("Ka 1.000 1.000 1.000\n")
        f.write("Kd 1.000 1.000 1.000\n")
        f.write("Ks 0.100 0.100 0.100\n")
        f.write("map_Kd texture_topo.png\n\n")
        f.write("newmtl Material_Satelit\n")
        f.write("Ka 1.000 1.000 1.000\n")
        f.write("Kd 1.000 1.000 1.000\n")
        f.write("map_Kd texture_satelit.jpg\n\n")
        f.write("newmtl Material_Side_Base\n")
        f.write("Ka 0.950 0.940 0.930\n")
        f.write("Kd 0.950 0.940 0.930\n")
        f.write("Ks 0.050 0.050 0.050\n")

    # Tulis OBJ terstruktur dengan UV coordinates
    with open(obj_path, "w", encoding="utf-8") as f:
        f.write("# 3D Model Kabupaten Banjarnegara\n")
        f.write(f"# Dihasilkan: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("mtllib banjarnegara_3d.mtl\n\n")

        # Vertices top (1..n_top)
        for v in print_top_v:
            f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
        # Vertices bottom (n_top+1..2*n_top)
        for v in print_bottom_v:
            f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")

        # UV coordinates untuk top mesh
        for uv in uv_coords:
            f.write(f"vt {uv[0]:.6f} {uv[1]:.6f}\n")
        # Dummy UV untuk bottom
        f.write("vt 0.000000 0.000000\n")
        dummy_uv_idx = len(uv_coords) + 1

        f.write("\ng Top_Terrain\n")
        f.write("usemtl Material_Topografi\n")
        for face in top_mesh.faces:
            # 1-indexed: v/vt
            f.write(f"f {face[0]+1}/{face[0]+1} {face[1]+1}/{face[1]+1} {face[2]+1}/{face[2]+1}\n")

        f.write("\ng Side_Skirt\n")
        f.write("usemtl Material_Side_Base\n")
        for face in skirt_faces:
            f.write(f"f {face[0]+1}/{dummy_uv_idx} {face[1]+1}/{dummy_uv_idx} {face[2]+1}/{dummy_uv_idx}\n")

        f.write("\ng Bottom_Base\n")
        f.write("usemtl Material_Side_Base\n")
        for face in print_bottom_faces:
            f.write(f"f {face[0]+1}/{dummy_uv_idx} {face[1]+1}/{dummy_uv_idx} {face[2]+1}/{dummy_uv_idx}\n")

    print(f"File OBJ & MTL tersimpan: {obj_path} ({os.path.getsize(obj_path):,} bytes)")

    print("\n=== 7. MENYUSUN DATA JSON UNTUK WEBGL THREE.JS ===")
    # Format JSON ringan untuk Three.js
    # Menggunakan skala unit WebGL yang dinormalisasi (lebar model ~ 100 unit Three.js)
    web_scale = 100.0 / width_m
    web_x = (x_meters * web_scale).round(3).tolist()
    web_y = (y_meters * web_scale).round(3).tolist()
    # Elevasi meter murni dipertahankan agar slider exaggeration di Three.js dapat mengubah Z seketika
    web_z = (z_relative).round(2).tolist()

    # Ekspor JSON terrain
    terrain_data = {
        "metadata": {
            "name": "Kabupaten Banjarnegara 3D Terrain",
            "date": time.strftime("%Y-%m-%d"),
            "bounds": [float(min_lon), float(min_lat), float(max_lon), float(max_lat)],
            "center": [float(center_lon), float(center_lat)],
            "dimensions_km": [round(float(width_m) / 1000.0, 2), round(float(height_m) / 1000.0, 2)],
            "elevation": {
                "min": round(float(min_elev), 1),
                "max": round(float(max_elev), 1),
                "mean": round(float(mean_elev), 1)
            },
            "web_scale": float(web_scale),
            "vertex_count": int(n_top),
            "face_count": int(len(top_mesh.faces))
        },
        "top": {
            "x": [float(x) for x in web_x],
            "y": [float(y) for y in web_y],
            "z": [float(z) for z in web_z],
            "u": [float(u) for u in uv_coords[:, 0].round(5)],
            "v": [float(v) for v in uv_coords[:, 1].round(5)],
            "faces": [int(f) for f in top_mesh.faces.flatten()]
        },
        "boundary_edges": [[int(e[0]), int(e[1])] for e in boundary_directed]
    }

    terrain_json_path = os.path.join(args.out_dir, "banjarnegara_terrain.json")
    with open(terrain_json_path, "w", encoding="utf-8") as f:
        json.dump(terrain_data, f)
    print(f"Data WebGL Terrain tersimpan: {terrain_json_path} ({os.path.getsize(terrain_json_path):,} bytes)")

    print("\n=== 8. MENGHASILKAN FITUR OVERLAY 3D (BATAS, SUNGAI, LANDMARKS) ===")
    # 8.A Landmarks
    landmarks_3d = []
    for lm in LANDMARKS:
        lon, lat = lm["lon"], lm["lat"]
        elev = float(sample_elev(np.array([lon]), np.array([lat]))[0])
        xm = (lon - center_lon) * cos_lat * 111319.5
        ym = (lat - center_lat) * 111319.5
        landmarks_3d.append({
            "nama": lm["nama"],
            "kategori": lm["kategori"],
            "deskripsi": lm["deskripsi"],
            "lon": lon,
            "lat": lat,
            "elev": round(elev, 1),
            "x": round(xm * web_scale, 3),
            "y": round(ym * web_scale, 3),
            "z_rel": round(elev - min_elev, 2)
        })

    # 8.B Batas Kecamatan (3D Lines)
    kecamatan_lines = []
    for feat in fc_kec["features"]:
        nama_kec = feat["properties"].get("nama", feat["properties"].get("KECAMATAN", ""))
        geom = feat["geometry"]
        gtype = geom["type"]
        polys = [geom["coordinates"]] if gtype == "Polygon" else geom["coordinates"]
        for p in polys:
            ring = p[0]
            pts_3d = []
            for pt in ring:
                lon, lat = pt[0], pt[1]
                elev = float(sample_elev(np.array([lon]), np.array([lat]))[0])
                xm = (lon - center_lon) * cos_lat * 111319.5
                ym = (lat - center_lat) * 111319.5
                pts_3d.append([
                    round(xm * web_scale, 3),
                    round(ym * web_scale, 3),
                    round(elev - min_elev, 2)
                ])
            kecamatan_lines.append({"nama": nama_kec, "points": pts_3d})

    # 8.C Sungai Utama (3D Lines)
    sungai_lines = []
    with open("geojson/index/kab_sungai.geojson", "r", encoding="utf-8") as f:
        fc_sungai = json.load(f)
    for feat in fc_sungai["features"]:
        geom = feat["geometry"]
        gtype = geom["type"]
        lines = [geom["coordinates"]] if gtype == "LineString" else geom["coordinates"]
        for line in lines:
            pts_3d = []
            for pt in line[::2]:
                lon, lat = pt[0], pt[1]
                elev = float(sample_elev(np.array([lon]), np.array([lat]))[0])
                xm = (lon - center_lon) * cos_lat * 111319.5
                ym = (lat - center_lat) * 111319.5
                pts_3d.append([
                    round(xm * web_scale, 3),
                    round(ym * web_scale, 3),
                    round(elev - min_elev, 2)
                ])
            if len(pts_3d) >= 2:
                sungai_lines.append(pts_3d)

    # 8.D Jaringan Jalan 3D
    jalan_lines = []
    with open("geojson/index/kab_transportasi.geojson", "r", encoding="utf-8") as f:
        fc_road = json.load(f)
    for feat in fc_road["features"]:
        geom = feat["geometry"]
        lines = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
        for line in lines:
            pts_3d = []
            for pt in line[::2]:
                lon, lat = pt[0], pt[1]
                elev = float(sample_elev(np.array([lon]), np.array([lat]))[0])
                xm = (lon - center_lon) * cos_lat * 111319.5
                ym = (lat - center_lat) * 111319.5
                pts_3d.append([
                    round(xm * web_scale, 3),
                    round(ym * web_scale, 3),
                    round(elev - min_elev, 2)
                ])
            if len(pts_3d) >= 2:
                jalan_lines.append(pts_3d)

    features_3d = {
        "landmarks": landmarks_3d,
        "kecamatan": kecamatan_lines,
        "sungai": sungai_lines,
        "jalan": jalan_lines
    }
    features_json_path = os.path.join(args.out_dir, "banjarnegara_features.json")
    with open(features_json_path, "w", encoding="utf-8") as f:
        json.dump(features_3d, f)
    print(f"Data Fitur 3D tersimpan: {features_json_path} ({os.path.getsize(features_json_path):,} bytes)")

    print("\n=== 9. MENGHASILKAN MODEL 3D BANGUNAN (BUILDINGS) ===")
    buildings_out = []
    bldg_path = "new/buildings_banjarnegara.geojson"
    if os.path.exists(bldg_path):
        with open(bldg_path, "r", encoding="utf-8") as f:
            fc_b = json.load(f)
        total_b = len(fc_b["features"])
        step = max(1, total_b // 12000)
        b_lons, b_lats, b_meta = [], [], []
        for i in range(0, total_b, step):
            feat = fc_b["features"][i]
            geom = shape(feat["geometry"])
            minx, miny, maxx, maxy = geom.bounds
            cx = (minx + maxx) / 2.0
            cy = (miny + maxy) / 2.0
            w_m = (maxx - minx) * 110000.0 * cos_lat
            l_m = (maxy - miny) * 110000.0
            area_m2 = geom.area * (110000.0**2) * cos_lat
            if 20 < area_m2 < 3000 and kab_poly.contains(Point(cx, cy)):
                xm = (cx - center_lon) * cos_lat * 111319.5
                ym = (cy - center_lat) * 111319.5
                h_m = 5.0 if area_m2 < 150 else (7.0 if area_m2 < 500 else 11.0)
                b_lons.append(cx)
                b_lats.append(cy)
                b_meta.append((round(xm * web_scale, 3), round(-ym * web_scale, 3), round(max(w_m, 6.0) * web_scale, 4), round(max(l_m, 6.0) * web_scale, 4), round(h_m * web_scale, 4)))

        if len(b_lons) > 0:
            elevs_b = sample_elev(np.array(b_lons), np.array(b_lats))
            for idx, (px, pz, w, l, h) in enumerate(b_meta):
                z_rel = round(float(elevs_b[idx] - min_elev), 2)
                buildings_out.append([px, pz, z_rel, w, l, h])

    out_b_file = os.path.join(args.out_dir, "banjarnegara_buildings.json")
    with open(out_b_file, "w", encoding="utf-8") as f:
        json.dump(buildings_out, f)
    print(f"Data Bangunan 3D tersimpan: {out_b_file} ({len(buildings_out):,} unit, {os.path.getsize(out_b_file):,} bytes)")

    print("\n=== 10. MENGHASILKAN MODEL 3D POHON & VEGETASI (TREES) ===")
    import random
    TREE_ZONES = {'31021000', '31041100', '32021000', '32022000', '32043000', '32042000', '32041000'}
    veg_geoms = [shape(feat['geometry']) for feat in fc_pola['features'] if feat['properties'].get('KODKWS', '') in TREE_ZONES]
    veg_union = unary_union(veg_geoms)

    random.seed(42)
    t_lons, t_lats, t_meta = [], [], []
    attempts = 0
    target_trees = 25000

    while len(t_lons) < target_trees and attempts < 250000:
        attempts += 1
        rx = random.uniform(min_lon, max_lon)
        ry = random.uniform(min_lat, max_lat)
        p = Point(rx, ry)
        if kab_poly.contains(p) and veg_union.contains(p):
            xm = (rx - center_lon) * cos_lat * 111319.5
            ym = (ry - center_lat) * 111319.5
            scale = round(random.uniform(0.7, 1.25), 2)
            t_lons.append(rx)
            t_lats.append(ry)
            t_meta.append((round(xm * web_scale, 3), round(-ym * web_scale, 3), scale))

    trees_out = []
    if len(t_lons) > 0:
        elevs_t = sample_elev(np.array(t_lons), np.array(t_lats))
        for idx, (px, pz, sc) in enumerate(t_meta):
            z_act = float(elevs_t[idx])
            z_rel = round(z_act - min_elev, 2)
            style = 1 if z_act > 1500.0 else 0
            trees_out.append([px, pz, z_rel, sc, style])

    out_t_file = os.path.join(args.out_dir, "banjarnegara_trees.json")
    with open(out_t_file, "w", encoding="utf-8") as f:
        json.dump(trees_out, f)
    print(f"Data Pohon 3D tersimpan: {out_t_file} ({len(trees_out):,} pohon, {os.path.getsize(out_t_file):,} bytes)")

    print("\n=======================================================")
    print(" SUKSES: SELURUH ASET 3D BANJARNEGARA TELAH DIGENERATE!")
    print("=======================================================")

if __name__ == "__main__":
    main()

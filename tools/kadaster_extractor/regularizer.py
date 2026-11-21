"""
Cadastral Regularizer Module
Converts building raster instances to georeferenced polygons, guarantees 90-degree orthogonal corners,
enforces rectangular footprints for >80% of buildings, and performs administrative spatial joins.
"""

import math
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.validation import make_valid
from shapely.affinity import rotate
from shapely.ops import unary_union
from shapely.strtree import STRtree
from skimage import measure

def calculate_geodesic_area_m2(poly: Polygon) -> float:
    """Menghitung estimasi luas poligon dalam meter persegi di ekuator / Jawa Tengah."""
    c_lat = poly.centroid.y
    m_per_deg_lat = 110574.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(c_lat))

    coords = list(poly.exterior.coords)
    if len(coords) < 3:
        return 0.0

    pts = [(x * m_per_deg_lon, y * m_per_deg_lat) for x, y in coords]
    area = 0.0
    for i in range(len(pts) - 1):
        area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(area) * 0.5

def regularize_building_geometry(poly: Polygon, min_area_m2: float = 18.0, max_area_m2: float = 9000.0):
    """
    Melakukan regularisasi kadaster berorientasi sudut siku-siku (Orthogonal Rectification):
    1. 80-90% bangunan adalah persegi panjang berorientasi (Oriented Bounding Box / MRR)
       dengan 4 sudut 90 derajat sempurna searah punggung atap / jalan.
    2. Bangunan majemuk / leter-L / leter-T diregularisasi menjadi poligon ortogonal
       dengan sudut siku-siku 90° dan 270° tanpa gerigi atau segitiga sembarangan.
    """
    if not poly.is_valid:
        poly = make_valid(poly)
    if isinstance(poly, MultiPolygon):
        poly = max(poly.geoms, key=lambda g: g.area)

    mrr = poly.minimum_rotated_rectangle
    if not mrr or mrr.is_empty or mrr.area == 0:
        return None

    extent = poly.area / mrr.area
    coords = list(mrr.exterior.coords)
    e1 = np.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1])
    e2 = np.hypot(coords[2][0] - coords[1][0], coords[2][1] - coords[1][1])
    l, w = max(e1, e2), min(e1, e2)

    # Filter sliver / garis jalan / pematang sempit
    if w <= 0 or (l / w) > 5.5:
        return None

    # Kasus 1: Standar Rumah Tinggal / Ruko Persegi (>80% bangunan di Banjarnegara)
    if extent >= 0.38:
        area_m2 = calculate_geodesic_area_m2(mrr)
        if min_area_m2 <= area_m2 <= max_area_m2:
            return mrr, area_m2, "box"
        return None

    # Kasus 2: Bangunan Majemuk Leter-L / Leter-T / Sayap Ganda
    # Rotasikan ke sumbu aksial ortogonal, pasang dua kotak penyusun, lalu rotasikan kembali
    try:
        dx = coords[1][0] - coords[0][0]
        dy = coords[1][1] - coords[0][1]
        angle = np.degrees(np.arctan2(dy, dx))
        c = poly.centroid
        r_poly = rotate(poly, -angle, origin=c)
        if not r_poly.is_valid:
            r_poly = make_valid(r_poly)

        minx, miny, maxx, maxy = r_poly.bounds
        if (maxx - minx) >= (maxy - miny):
            mid = (minx + maxx) * 0.5
            b1 = box(minx, miny, mid, maxy).intersection(r_poly)
            b2 = box(mid, miny, maxx, maxy).intersection(r_poly)
        else:
            mid = (miny + maxy) * 0.5
            b1 = box(minx, miny, maxx, mid).intersection(r_poly)
            b2 = box(minx, mid, maxx, maxy).intersection(r_poly)

        parts = []
        if not b1.is_empty and b1.area > 0:
            parts.append(b1.envelope)
        if not b2.is_empty and b2.area > 0:
            parts.append(b2.envelope)

        if parts:
            u = unary_union(parts)
            ortho = rotate(u, angle, origin=c)
            if ortho.is_valid and not ortho.is_empty:
                area_m2 = calculate_geodesic_area_m2(ortho)
                if min_area_m2 <= area_m2 <= max_area_m2:
                    return ortho, area_m2, "composite_ortho"
    except Exception:
        pass

    # Fallback aman: gunakan Oriented Bounding Box
    area_m2 = calculate_geodesic_area_m2(mrr)
    if min_area_m2 <= area_m2 <= max_area_m2:
        return mrr, area_m2, "box"

    return None

def instance_to_geopolygon(comp_mask: np.ndarray, offset_y: int, offset_x: int, patch,
                           min_area_m2: float = 18.0, max_area_m2: float = 9000.0):
    """
    Mengonversi biner mask instance rumah individual ke poligon georeferensi WGS84 ortogonal.
    """
    cnts = measure.find_contours(comp_mask.astype(float), level=0.5)
    if not cnts:
        return None

    c_pts = max(cnts, key=len)
    if len(c_pts) < 4:
        return None

    # Konversi koordinat piksel global patch ke WGS84 (lon, lat)
    geo_coords = []
    for pt in c_pts:
        py = pt[0] + offset_y
        px = pt[1] + offset_x
        lat, lon = patch.pixel_to_latlon(px, py)
        geo_coords.append((round(lon, 6), round(lat, 6)))

    if len(geo_coords) < 4:
        return None

    try:
        raw_poly = Polygon(geo_coords)
        return regularize_building_geometry(raw_poly, min_area_m2=min_area_m2, max_area_m2=max_area_m2)
    except Exception:
        return None

class DesaClassifier:
    """Melakukan spatial indexing (STRtree) untuk menautkan persil bangunan ke kelurahan/desa setempat."""
    def __init__(self, desa_features):
        self.desa_list = []
        self.geoms = []
        for feat in desa_features:
            g = feat["geometry"]
            from shapely.geometry import shape
            poly = shape(g)
            self.geoms.append(poly)
            self.desa_list.append(feat["properties"].get("Nama_Desa_", "Desa"))

        self.tree = STRtree(self.geoms)

    def classify_building(self, poly: Polygon) -> str:
        centroid = poly.centroid
        cand_indices = self.tree.query(centroid)
        for idx in cand_indices:
            if self.geoms[idx].contains(centroid) or self.geoms[idx].intersects(poly):
                return self.desa_list[idx]
        return "Kecamatan Banjarnegara"

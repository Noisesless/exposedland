"""
Building Roof Detector Module
Performs spectral analysis, vegetation suppression, and edge-contour extraction on satellite imagery.
"""

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure, morphology, color, feature, segmentation

def extract_building_binary_mask(img_rgb: np.ndarray) -> np.ndarray:
    """
    Menganalisis citra RGB satelit untuk mengekstrak biner mask atap bangunan:
    1. Filter spektral atap genteng (terakota/merah bata)
    2. Filter spektral atap seng/asbes/beton cerah
    3. Penekanan vegetasi pohon & sawah hijau (Excess Green Index)
    4. Penekanan aspal jalan gelap & bayangan
    """
    # 1. Konversi ke HSV dan LAB
    img_hsv = color.rgb2hsv(img_rgb)
    h = img_hsv[:, :, 0] * 360.0  # 0 - 360
    s = img_hsv[:, :, 1]          # 0 - 1
    v = img_hsv[:, :, 2] * 255.0  # 0 - 255

    r = img_rgb[:, :, 0].astype(float)
    g = img_rgb[:, :, 1].astype(float)
    b = img_rgb[:, :, 2].astype(float)

    # 2. Indeks Vegetasi (Excess Green: 2G - R - B)
    # Tanaman hijau memiliki nilai ExG positif tinggi
    exg = 2.0 * g - r - b
    is_vegetation = (exg > 10.0) | ((h >= 55.0) & (h <= 165.0) & (s > 0.12))

    # 3. Indeks Badan Air & Bayangan Gelap Aspal
    is_shadow_or_water = (v < 48.0) | ((b > r + 16.0) & (b > g + 10.0) & (v < 95.0))

    # 4. Deteksi Spektral Atap
    # A. Atap genteng terakota / tanah liat (termasuk yang lapuk/berdebu khas Banjarnegara)
    is_clay_roof = ((h <= 42.0) | (h >= 328.0)) & (s > 0.08) & (v >= 55.0) & (r >= g) & ~is_vegetation

    # B. Atap seng / asbes / dak ruko cerah
    is_bright_roof = (v >= 155.0) & (s < 0.32) & ~is_vegetation

    # C. Atap metalik / spandek biru/hijau ruko
    is_metallic_roof = (v >= 100.0) & (s > 0.18) & ((h >= 170.0) & (h <= 240.0)) & ~is_vegetation

    # Gabungan kandidat atap
    building_mask = (is_clay_roof | is_bright_roof | is_metallic_roof) & ~is_shadow_or_water & ~is_vegetation

    # 5. Operasi Morfologi (Penutupan sela nok genteng & pembersihan bintik halus)
    # Menghapus noise kecil di bawah 10 piksel
    clean_mask = morphology.remove_small_objects(building_mask, min_size=10)
    # Penutupan celah antara bubungan atap
    struct = morphology.footprint_rectangle((3, 3))
    clean_mask = morphology.binary_closing(clean_mask, struct)
    clean_mask = morphology.remove_small_holes(clean_mask, area_threshold=20)

    return clean_mask

def segment_building_instances(mask: np.ndarray, min_peak_dist: int = 5, min_roof_val: int = 2):
    """
    Memisahkan klaster atap rumah yang saling menempel menggunakan Distance Transform + Watershed.
    Menghasilkan label mask unik untuk setiap unit persil bangunan individual.
    """
    if not np.any(mask):
        return np.zeros_like(mask, dtype=int), 0

    dist = ndimage.distance_transform_edt(mask)
    coords = feature.peak_local_max(dist, min_distance=min_peak_dist, threshold_abs=min_roof_val)
    if len(coords) == 0:
        labeled, num = ndimage.label(mask)
        return labeled, num

    mask_peaks = np.zeros(dist.shape, dtype=bool)
    mask_peaks[tuple(coords.T)] = True
    markers, num_markers = ndimage.label(mask_peaks)
    labels = segmentation.watershed(-dist, markers, mask=mask)
    return labels, num_markers

def extract_contours_from_mask(mask: np.ndarray, min_area_px: int = 16, max_area_px: int = 12000):
    """
    Menemukan poligon kontur eksternal dari biner mask bangunan.
    Mengembalikan daftar koordinat piksel [(py, px), ...].
    """
    labeled_mask, num_features = ndimage.label(mask)
    if num_features == 0:
        return []

    contours = measure.find_contours(mask.astype(float), level=0.5)
    valid_contours = []

    for c in contours:
        # Cek luas piksel menggunakan Shoelace formula
        y = c[:, 0]
        x = c[:, 1]
        area = 0.5 * np.abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))

        if min_area_px <= area <= max_area_px and len(c) >= 4:
            valid_contours.append(c)

    return valid_contours

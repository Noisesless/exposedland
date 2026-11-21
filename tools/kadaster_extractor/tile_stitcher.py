"""
Tile Stitcher Module
Stitches satellite tiles into georeferenced raster patches and computes pixel-to-geocoordinates transforms.
"""

import math
from pathlib import Path
from PIL import Image
import numpy as np

def num2deg_float(x_float: float, y_float: float, zoom: int):
    """Konversi koordinat ubin float ke koordinat WGS84 (lat, lon)."""
    n = 2.0 ** zoom
    lon_deg = (x_float / n) * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1.0 - 2.0 * y_float / n)))
    lat_deg = math.degrees(lat_rad)
    return lat_deg, lon_deg

def deg2num_float(lat_deg: float, lon_deg: float, zoom: int):
    """Konversi koordinat WGS84 ke koordinat ubin float (x, y)."""
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    x_float = (lon_deg + 180.0) / 360.0 * n
    y_float = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return x_float, y_float

class StitchedPatch:
    def __init__(self, x_start: int, x_end: int, y_start: int, y_end: int, zoom: int, image_np: np.ndarray):
        self.x_start = x_start
        self.x_end = x_end
        self.y_start = y_start
        self.y_end = y_end
        self.zoom = zoom
        self.image = image_np
        self.width_tiles = (x_end - x_start + 1)
        self.height_tiles = (y_end - y_start + 1)
        self.width_px = self.width_tiles * 256
        self.height_px = self.height_tiles * 256

    def pixel_to_latlon(self, px: float, py: float):
        """Konversi dari koordinat piksel raster (px, py) ke (lat, lon) WGS84."""
        xf = self.x_start + (px / 256.0)
        yf = self.y_start + (py / 256.0)
        return num2deg_float(xf, yf, self.zoom)

    def latlon_to_pixel(self, lat: float, lon: float):
        """Konversi dari (lat, lon) WGS84 ke piksel raster (px, py)."""
        xf, yf = deg2num_float(lat, lon, self.zoom)
        px = (xf - self.x_start) * 256.0
        py = (yf - self.y_start) * 256.0
        return px, py

def stitch_tile_patch(x_start: int, x_end: int, y_start: int, y_end: int, zoom: int, cache_dir: Path) -> StitchedPatch:
    """
    Menjahit sekumpulan ubin satelit dalam rentang X dan Y menjadi satu patch citra RGB besar.
    """
    w_tiles = (x_end - x_start + 1)
    h_tiles = (y_end - y_start + 1)
    out_img = Image.new("RGB", (w_tiles * 256, h_tiles * 256), color=(40, 45, 50))

    for x in range(x_start, x_end + 1):
        for y in range(y_start, y_end + 1):
            tile_path = cache_dir / f"{zoom}_{x}_{y}.jpg"
            if tile_path.exists():
                try:
                    with Image.open(tile_path) as t:
                        pos_x = (x - x_start) * 256
                        pos_y = (y - y_start) * 256
                        out_img.paste(t, (pos_x, pos_y))
                except Exception:
                    pass

    return StitchedPatch(x_start, x_end, y_start, y_end, zoom, np.array(out_img))

"""
Tile Fetcher Module
Downloads and caches high-definition Google Satellite tiles (2026) for any target kecamatan.
"""

import os
import math
import asyncio
import aiohttp
from pathlib import Path
from shapely.geometry import box

GOOGLE_SAT_URL = "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

def deg2num(lat_deg: float, lon_deg: float, zoom: int):
    """Konversi koordinat WGS84 ke indeks ubin Web Mercator (x, y)."""
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return xtile, ytile

def num2deg(xtile: int, ytile: int, zoom: int):
    """Konversi indeks ubin Web Mercator ke koordinat barat-utara (lat, lon)."""
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return lat_deg, lon_deg

def get_tiles_for_geometry(geom, zoom: int):
    """
    Menghitung daftar pasangan (x, y) yang beririsan langsung dengan poligon batas kecamatan.
    Menghilangkan ubin kosong di luar wilayah batas.
    """
    min_lon, min_lat, max_lon, max_lat = geom.bounds
    x_min, y_max = deg2num(min_lat, min_lon, zoom)
    x_max, y_min = deg2num(max_lat, max_lon, zoom)

    x_start, x_end = min(x_min, x_max), max(x_min, x_max)
    y_start, y_end = min(y_min, y_max), max(y_min, y_max)

    tiles = []
    for x in range(x_start, x_end + 1):
        for y in range(y_start, y_end + 1):
            lat_top, lon_left = num2deg(x, y, zoom)
            lat_bottom, lon_right = num2deg(x + 1, y + 1, zoom)
            tile_box = box(lon_left, lat_bottom, lon_right, lat_top)
            if geom.intersects(tile_box):
                tiles.append((x, y))

    return tiles, (x_start, x_end, y_start, y_end)

async def _fetch_single_tile(session, x: int, y: int, z: int, cache_path: Path, sem):
    """Mengunduh 1 ubin satelit jika belum ada di cache."""
    if cache_path.exists() and cache_path.stat().st_size > 500:
        return True

    sub = str((x + y) % 4)
    url = GOOGLE_SAT_URL.format(s=sub, x=x, y=y, z=z)
    headers = {"User-Agent": USER_AGENT, "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"}

    async with sem:
        for attempt in range(3):
            try:
                async with session.get(url, headers=headers, timeout=12) as resp:
                    if resp.status == 200:
                        content = await resp.read()
                        if len(content) > 500:
                            cache_path.parent.mkdir(parents=True, exist_ok=True)
                            with open(cache_path, "wb") as f:
                                f.write(content)
                            return True
                    elif resp.status == 404:
                        return False
            except Exception:
                await asyncio.sleep(0.5 * (2 ** attempt))
    return False

async def download_tiles_async(tiles, zoom: int, cache_dir: Path, concurrency: int = 15):
    """Mengunduh sekumpulan ubin secara asynchronous multi-threading."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(concurrency)
    conn = aiohttp.TCPConnector(limit=concurrency + 5, force_close=False)

    async with aiohttp.ClientSession(connector=conn) as session:
        tasks = []
        for x, y in tiles:
            tile_file = cache_dir / f"{zoom}_{x}_{y}.jpg"
            tasks.append(_fetch_single_tile(session, x, y, zoom, tile_file, sem))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        success = sum(1 for r in results if r is True)
        return success, len(tiles)

def fetch_kecamatan_tiles(kecamatan_slug: str, geom, zoom: int = 18, base_cache_dir: str = "tools/cache_sat_tiles"):
    """Fungsi pembungkus sinkron untuk mengunduh seluruh ubin satelit suatu kecamatan."""
    cache_dir = Path(base_cache_dir) / kecamatan_slug / f"z{zoom}"
    tiles, grid_bbox = get_tiles_for_geometry(geom, zoom)

    print(f"[{kecamatan_slug.upper()}] Ditemukan {len(tiles)} ubin satelit yang beririsan (Zoom {zoom}).")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        success, total = loop.run_until_complete(download_tiles_async(tiles, zoom, cache_dir))
        print(f"[{kecamatan_slug.upper()}] Berhasil mengunduh/memuat {success}/{total} ubin dari cache.")
    finally:
        loop.close()

    return tiles, grid_bbox, cache_dir

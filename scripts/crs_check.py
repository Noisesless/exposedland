"""CRS + length rollup check by parsing coordinate pairs out of WKT strings."""
import json, os, re, collections

DATA = r"I:\tataruang\data"
NUM = re.compile(r"(-?\d+\.?\d*(?:[eE][-+]?\d+)?)\s+(-?\d+\.?\d*(?:[eE][-+]?\d+)?)")

files = ["batas_administrasi.json", "jaringan_transportasi.json",
         "sungai_banjarnegara.json", "rencana_pola_ruang.json"]

for fn in files:
    with open(os.path.join(DATA, fn), encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    xs = []; ys = []
    for d in data:
        w = d.get("wkt_geometry") or ""
        for m in NUM.finditer(w):
            xs.append(float(m.group(1))); ys.append(float(m.group(2)))

    if not xs:
        print(f"{fn}: no coords parsed"); continue
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    utm = xmin > 1000 or abs(ymin) > 1000
    crs = "UTM Zona 49S (EPSG:32749) - meters" if utm else "WGS84 geographic (EPSG:4326) - degrees"
    print("=" * 84)
    print(fn, f"| records={len(data)} | coords={len(xs)}")
    print(f"  BBOX X: {xmin:.5f} .. {xmax:.5f}")
    print(f"  BBOX Y: {ymin:.5f} .. {ymax:.5f}")
    print(f"  CRS   : {crs}")

    # extent sanity in km
    if utm:
        print(f"  EXTENT: {(xmax-xmin)/1000:.2f} km x {(ymax-ymin)/1000:.2f} km")
    else:
        print(f"  EXTENT: {(xmax-xmin)*110.57:.2f} km x {(ymax-ymin)*110.57:.2f} km (approx at lat {ymin:.2f})")

    if "SHAPE_Leng" in data[0]:
        tot = sum(d.get("SHAPE_Leng") or 0 for d in data)
        unit = "m" if utm else "deg"
        if utm:
            print(f"  TOTAL LENGTH: {tot/1000:,.2f} km")
        else:
            print(f"  TOTAL LENGTH: {tot:,.4f} deg (~{tot*110.57:,.1f} km approx)")

    if "NAMOBJ" in data[0] and "SHAPE_Leng" in data[0]:
        agg = collections.defaultdict(lambda: [0, 0.0])
        for d in data:
            k = d.get("NAMOBJ") or "(null)"
            agg[k][0] += 1; agg[k][1] += d.get("SHAPE_Leng") or 0
        print("  BY NAMOBJ:")
        for k, (c, l) in sorted(agg.items(), key=lambda x: -x[1][1]):
            unit_l = f"{l/1000:,.1f} km" if utm else f"{l*110.57:,.1f} km"
            print(f"    {k[:50]:<50} n={c:<5} {unit_l}")
    print()

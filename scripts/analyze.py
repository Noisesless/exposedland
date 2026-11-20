"""Deep analysis of SIMTARU Banjarnegara spatial data."""
import json, os, collections, io

DATA = r"I:\tataruang\data"
OUT = io.StringIO()

def p(*a):
    print(*a, file=OUT)

def coord_stats(obj):
    """Walk nested coords, return xmin,xmax,ymin,ymax."""
    xs, ys = [], []
    def walk(c):
        if isinstance(c, (list, tuple)):
            if len(c) >= 2 and isinstance(c[0], (int, float)) and isinstance(c[1], (int, float)):
                xs.append(c[0]); ys.append(c[1])
            else:
                for i in c: walk(i)
    walk(obj)
    if not xs: return None
    return min(xs), max(xs), min(ys), max(ys)

def geom_type(wkt):
    return wkt.strip().split("(")[0].strip().upper()

files = ["batas_administrasi.json", "jaringan_transportasi.json",
         "sungai_banjarnegara.json", "rencana_pola_ruang.json"]

summary = {}

for fn in files:
    path = os.path.join(DATA, fn)
    with open(path, encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    p("=" * 90)
    p(f"FILE: {fn}   |   {os.path.getsize(path)/1024/1024:.2f} MB   |   {len(data)} records")
    p("=" * 90)

    keys = list(data[0].keys())
    p(f"\nFIELDS ({len(keys)}): {keys}\n")

    # geometry types
    gtypes = collections.Counter(geom_type(d.get("wkt_geometry", "")) for d in data)
    p(f"GEOMETRY TYPES: {dict(gtypes)}")

    # crs detection
    allx, ally = [], []
    for d in data:
        w = d.get("wkt_geometry", "")
        st = coord_stats(w)
        if st:
            allx += [st[0], st[1]]; ally += [st[2], st[3]]
    if allx:
        xmin, xmax = min(allx), max(allx)
        ymin, ymax = min(ally), max(ally)
        crs = "UTM 49S (projected, meters)" if xmin > 1000 or abs(ymin) > 1000 else "WGS84 geographic (degrees)"
        p(f"BBOX        : X {xmin:.4f} .. {xmax:.4f}   Y {ymin:.4f} .. {ymax:.4f}")
        p(f"CRS GUESS   : {crs}")
    p("")

    # field-level completeness + cardinality
    p("FIELD PROFILE:")
    for k in keys:
        if k == "wkt_geometry":
            nonempty = sum(1 for d in data if d.get(k))
            p(f"  {'wkt_geometry':<18} <WKT geometry string>   non-null: {nonempty}/{len(data)}")
            continue
        vals = [d.get(k) for d in data]
        nonnull = [v for v in vals if v not in (None, "", "None")]
        nums = [v for v in nonnull if isinstance(v, (int, float))]
        cnt = collections.Counter(str(v) for v in nonnull)
        line = f"  {k:<18} non-null: {len(nonnull):>5}/{len(data):<5} unique: {len(cnt):<5}"
        if nums:
            line += f" range: {min(nums):.4g} .. {max(nums):.4g}"
        p(line)
        if 1 < len(cnt) <= 25:
            p(f"      values: {dict(cnt.most_common(25))}")
        elif len(cnt) == 1:
            p(f"      value: {list(cnt)[0]}")

    # area rollup if LUASHA exists
    if "LUASHA" in keys:
        tot = sum(d.get("LUASHA") or 0 for d in data)
        p(f"\nTOTAL LUASHA: {tot:,.2f} ha  ({tot/100:,.2f} km2)")
        if "NAMOBJ" in keys:
            agg = collections.defaultdict(lambda: [0, 0.0])
            for d in data:
                agg[d.get("NAMOBJ") or "(null)"][0] += 1
                agg[d.get("NAMOBJ") or "(null)"][1] += d.get("LUASHA") or 0
            p("\nAREA BY NAMOBJ (pola ruang / objek):")
            for nm, (c, a) in sorted(agg.items(), key=lambda x: -x[1][1]):
                p(f"  {nm[:52]:<52} n={c:<5} {a:>12,.2f} ha")
    p("\n")

    summary[fn] = {"records": len(data), "fields": keys}

with open(r"I:\tataruang\data\ANALYSIS_REPORT.txt", "w", encoding="utf-8") as f:
    f.write(OUT.getvalue())
print("written")

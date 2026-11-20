"""Inspect raw JSON dumps from SIMTARU Banjarnegara."""
import json, os, collections

DATA = r"I:\tataruang\data"

for fn in sorted(os.listdir(DATA)):
    if not fn.endswith(".json"):
        continue
    path = os.path.join(DATA, fn)
    print("=" * 78)
    print("FILE:", fn, f"({os.path.getsize(path)/1024/1024:.2f} MB)")
    print("=" * 78)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        head = f.read(400)
    print("RAW HEAD:", head[:400].replace("\n", " "))
    print()

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        obj = json.load(f)

    print("TOP-LEVEL TYPE:", type(obj).__name__, end="")
    if isinstance(obj, dict):
        print("  keys:", list(obj.keys())[:20])
        # maybe geojson
        if "features" in obj:
            feats = obj["features"]
            print("  -> GeoJSON FeatureCollection, n features:", len(feats))
            print("  feature[0]:", json.dumps(feats[0])[:600])
        obj = obj.get("features", obj)
    else:
        print("  len:", len(obj))

    if isinstance(obj, list) and obj:
        r0 = obj[0]
        print("ELEMENT TYPE:", type(r0).__name__)
        if isinstance(r0, dict):
            print("KEYS of [0]:")
            for k, v in r0.items():
                sv = str(v)
                print(f"   - {k!r:24} :: {type(v).__name__:8} :: {sv[:90]}")
            print()
            # value distributions for small-cardinality string fields
            print("FIELD SUMMARY (n=%d):" % len(obj))
            keys = list(r0.keys())
            n = len(obj)
            for k in keys:
                vals = []
                for it in obj[:n]:
                    if isinstance(it, dict):
                        v = it.get(k)
                        if isinstance(v, str) and not (v.startswith("POLYGON") or v.startswith("LINESTRING") or v.startswith("POINT") or v.startswith("MULTI")):
                            vals.append(v)
                if vals:
                    c = collections.Counter(vals)
                    if len(c) <= 40:
                        print(f"   {k}: {len(c)} unique -> {dict(c.most_common(40))}")
                    else:
                        print(f"   {k}: {len(c)} unique (sample: {list(c.most_common(6))})")
    print()

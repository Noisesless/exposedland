"""Ringkasan luas/panjang per kelas & per kecamatan (tanpa geometri).

Dipisah dari file .geojson supaya viewer bisa menampilkan legenda dan
komposisi wilayah seketika, tanpa harus mengunduh geometri 37 MB.
"""
import json, os, re
from collections import defaultdict

GJ = r"I:\tataruang\geojson"
OUT = os.path.join(GJ, "index", "ringkasan.json")


def slug(s):
    """Harus sama persis dengan scripts/convert.py dan web/app.js."""
    return re.sub(r"[^A-Za-z0-9]+", "-", str(s).strip()).strip("-").lower()


def krb_kategori(v):
    """'Kawasan Rawan Bencana Banjir Tingkat Tinggi; ...' -> daftar kategori."""
    s = str(v or "").strip()
    if not s or s.lower() == "tidak ada":
        return []
    s = s.lower()
    out = []
    if "banjir" in s:
        out.append("banjir")
    if "gerakan tanah" in s:
        out.append("gerakan_tanah")
    if "letusan" in s:
        out.append("letusan")
    return out


def muat(nama):
    with open(os.path.join(GJ, "full", f"{nama}.geojson"), encoding="utf-8") as f:
        return json.load(f)["features"]


pola = muat("pola_ruang")

kelas = defaultdict(lambda: {"ha": 0.0, "n": 0})
per_kec_kelas = defaultdict(lambda: defaultdict(lambda: {"ha": 0.0, "n": 0}))
krb_total = defaultdict(lambda: {"ha": 0.0, "n": 0})
krb_per_kec = defaultdict(lambda: defaultdict(lambda: {"ha": 0.0, "n": 0}))

for f in pola:
    p = f["properties"]
    kode = p.get("KODKWS")
    nama = p.get("NAMOBJ")
    ha = p.get("luas_ha_geo") or 0.0
    kec = slug(p.get("kecamatan"))
    kunci = f"{kode}|{nama}"

    kelas[kunci]["ha"] += ha
    kelas[kunci]["n"] += 1
    per_kec_kelas[kec][kunci]["ha"] += ha
    per_kec_kelas[kec][kunci]["n"] += 1

    for kat in krb_kategori(p.get("KRB_03")):
        krb_total[kat]["ha"] += ha
        krb_total[kat]["n"] += 1
        krb_per_kec[kec][kat]["ha"] += ha
        krb_per_kec[kec][kat]["n"] += 1


def rapikan(d):
    return sorted(
        [{"kode": k.split("|")[0], "nama": k.split("|")[1],
          "ha": round(v["ha"], 2), "n": v["n"]} for k, v in d.items()],
        key=lambda x: -x["ha"],
    )


transportasi = muat("transportasi")
sungai = muat("sungai")
panjang = defaultdict(lambda: {"transportasi_km": 0.0, "sungai_km": 0.0})
for f in transportasi:
    panjang[slug(f["properties"].get("kecamatan"))]["transportasi_km"] += f["properties"].get("panjang_km_geo") or 0
for f in sungai:
    panjang[slug(f["properties"].get("kecamatan"))]["sungai_km"] += f["properties"].get("panjang_km_geo") or 0

hasil = {
    "total_ha": round(sum(v["ha"] for v in kelas.values()), 2),
    "total_fitur": len(pola),
    "kabupaten": rapikan(kelas),
    "kecamatan": {k: rapikan(v) for k, v in per_kec_kelas.items()},
    "krb_kabupaten": {k: {"ha": round(v["ha"], 2), "n": v["n"]} for k, v in krb_total.items()},
    "krb_kecamatan": {k: {kk: {"ha": round(vv["ha"], 2), "n": vv["n"]} for kk, vv in v.items()}
                      for k, v in krb_per_kec.items()},
    "panjang_kecamatan": {k: {"transportasi_km": round(v["transportasi_km"], 2),
                              "sungai_km": round(v["sungai_km"], 2)}
                          for k, v in panjang.items()},
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)

# kunci kecamatan harus sama dengan slug di daftar_kecamatan.json
daftar_path = os.path.join(GJ, "index", "daftar_kecamatan.json")
with open(daftar_path, encoding="utf-8") as f:
    daftar = {k["slug"] for k in json.load(f)["kecamatan"]}
beda = set(hasil["kecamatan"]) ^ daftar
if beda:
    raise SystemExit(f"GAGAL: slug ringkasan tidak cocok dengan daftar_kecamatan.json: {beda}")
print(f"slug ringkasan vs daftar_kecamatan: OK ({len(daftar)} kecamatan)")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(hasil, f, ensure_ascii=False, indent=1)

print(f"OK -> {OUT} ({os.path.getsize(OUT)/1024:.1f} KB)")
print(f"total {hasil['total_ha']:,.2f} ha / {hasil['total_fitur']} fitur / {len(kelas)} kelas")
print("KRB:", {k: v["n"] for k, v in hasil["krb_kabupaten"].items()})
print("contoh kecamatan:", list(hasil["kecamatan"])[:3])
print("contoh panjang:", list(hasil["panjang_kecamatan"].items())[:2])

#!/usr/bin/env python3
"""Uji pembuat jalur peta dunia: dekode TopoJSON, kode negara, Antartika dibuang, cincin melintasi bujur 180 dipecah. Pemakaian: python3 scripts/tests/test_map_geo.py"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); tmp = tempfile.mkdtemp()
# koordinat kuantisasi 1 derajat: translate (-180,-90), scale 1. Fiji-like: kotak dari lon 178..-178 (melintasi 180); Jepang-like: kotak biasa; Antartika id 010.
def ring(pts):
    out = []; px = py = 0
    for x, y in pts: out.append([x - px, y - py]); px, py = x, y
    return out
fiji = [(358, 73), (358, 75), (2, 75), (2, 73), (358, 73)]       # lon = x-180 -> 178, 178, -178, -178
japan = [(310, 125), (310, 127), (313, 127), (313, 125), (310, 125)]
ant = [(0, 0), (0, 5), (360, 5), (360, 0), (0, 0)]
topo = {"type": "Topology", "transform": {"scale": [1, 1], "translate": [-180, -90]}, "arcs": [ring(fiji), ring(japan), ring(ant)],
        "objects": {"countries": {"type": "GeometryCollection", "geometries": [{"type": "Polygon", "id": "242", "properties": {"name": "Fiji"}, "arcs": [[0]]},
            {"type": "Polygon", "id": "392", "properties": {"name": "Japan"}, "arcs": [[1]]}, {"type": "Polygon", "id": "010", "properties": {"name": "Antarctica"}, "arcs": [[2]]}]}}}
src = os.path.join(tmp, "t.json"); out = os.path.join(tmp, "o.json"); json.dump(topo, open(src, "w"))
r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "..", "trg_map_geo.py"), "--topo", src, "--out", out], capture_output=True, text=True); assert r.returncode == 0, r.stderr + r.stdout
d = json.load(open(out)); by = {x["c"]: x for x in d["negara"]}
assert set(by) == {"FJ", "JP"}, by.keys()                       # Antartika dibuang; kode ISO alpha-2 benar
assert by["FJ"]["d"].count("M") == 2 and by["JP"]["d"].count("M") == 1, "cincin lintas bujur 180 harus jadi dua bagian"
xs = [float(p.split(",")[0]) for p in by["JP"]["d"].replace("M", "").replace("Z", "").split("L")]; assert all(0 <= x <= d["w"] for x in xs), xs
print("OK | dekode TopoJSON, ISO alpha-2, Antartika dibuang, cincin lintas bujur 180 dipecah | tinggi", d["h"])

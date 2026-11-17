#!/usr/bin/env python3
"""Ubah TopoJSON negara (world-atlas countries-110m, domain publik Natural Earth) menjadi jalur SVG siap tayang untuk peta dunia dasbor.

Pemakaian: python3 scripts/trg_map_geo.py --topo countries-110m.json [--out site/peta-riset/data/dunia.json]
Proyeksi Natural Earth (tanpa pustaka luar); Antartika dibuang. Keluaran: {"w":..,"h":..,"negara":[{"c":"ID","n":"Indonesia","d":"M..Z"}]}
Kode negara ISO alpha-2 dibutuhkan agar cocok dengan data OpenAlex; butuh paket pycountry (hanya saat membangun, bukan saat dasbor berjalan).
"""
import argparse, json, math, os
import pycountry

W = 1000


def project(lon, lat):
    l, p = math.radians(lon), math.radians(lat)
    p2, p4 = p * p, p ** 4
    x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)))
    y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
    return x, y


def decode_arcs(topo):
    sc, tr = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for a in topo["arcs"]:
        x = y = 0; pts = []
        for dx, dy in a:
            x += dx; y += dy; pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
        arcs.append(pts)
    return arcs


def ring(arcs, idxs):
    pts = []
    for i in idxs:
        seg = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(seg if not pts else seg[1:])
    return pts


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--topo", required=True); ap.add_argument("--out", default="site/peta-riset/data/dunia.json")
    a = ap.parse_args(); topo = json.load(open(a.topo, encoding="utf-8")); arcs = decode_arcs(topo)
    geoms = topo["objects"]["countries"]["geometries"]
    ex = project(180, 0)[0]; ytop, ybot = project(0, 84)[1], project(0, -58)[1]      # tanpa Antartika: lintang -58 sampai 84
    k = W / (2 * ex); H = round((ytop - ybot) * k)
    out = []
    for g in geoms:
        num = str(g.get("id", "")).zfill(3)
        if num == "010":
            continue
        c = pycountry.countries.get(numeric=num)
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]] if g["type"] == "Polygon" else []
        d = []
        for poly in polys:
            for r in poly:
                ll = ring(arcs, r)
                cross = any(abs(ll[i][0] - ll[i - 1][0]) > 180 for i in range(1, len(ll)))      # cincin melintasi garis bujur 180 (Fiji, Rusia)
                variants = [ll] if not cross else [[((lo + 360) if lo < 0 else lo, la) for lo, la in ll], [(lo if lo < 0 else lo - 360, la) for lo, la in ll]]
                for v in variants:
                    pts = [project(lo, la) for lo, la in v]
                    pts = [(round(W / 2 + x * k, 1), round((ytop - y) * k, 1)) for x, y in pts]
                    if len(pts) > 2:
                        d.append("M" + "L".join(f"{x},{y}" for x, y in pts) + "Z")
        if d:
            out.append({"c": c.alpha_2 if c else "", "n": g.get("properties", {}).get("name", ""), "d": "".join(d)})
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump({"w": W, "h": H, "negara": out}, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} negara, {os.path.getsize(a.out)} bytes, tanpa kode: {[x['n'] for x in out if not x['c']]}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Uji kontrak: data situs harus sesuai skema di schemas/. Pemakaian: python3 scripts/trg_api_check.py [SITE_DATA_DIR]
Dipakai tim pengembang sebagai pemeriksaan sebelum merilis data baru atau sebelum memindahkan data ke database."""
import json, os, sys, jsonschema
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "site", "peta-riset", "data")
bad = 0
for name in ("peneliti", "trg", "tag", "meta", "insights"):
    schema = json.load(open(os.path.join(ROOT, "schemas", f"{name}.schema.json"), encoding="utf-8"))
    data = json.load(open(os.path.join(D, f"{name}.json"), encoding="utf-8"))
    errs = sorted(jsonschema.Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path))
    print(f"{name:9} {'OK' if not errs else str(len(errs)) + ' galat'}")
    for e in errs[:3]:
        print("   ", "/".join(map(str, e.path)), "->", e.message[:120]); bad += 1
sys.exit(1 if bad else 0)

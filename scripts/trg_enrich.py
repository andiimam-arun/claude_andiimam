#!/usr/bin/env python3
"""Pengayaan artikel dan peneliti lewat API bibliografi terbuka (OpenAlex, Crossref, ORCID).

Pemakaian:
  BIBLIO_MAILTO=alamat@unhas.ac.id python3 scripts/trg_enrich.py --cache CACHE_DIR [--out data/trg] [--limit N]
                                                                 [--no-title-match] [--orcid-verify]

Keluaran (CSV di --out):
  artikel_metrik.csv   satu baris per artikel unik yang berhasil dicocokkan: sitasi, FWCI, jurnal, OA, dasar kecocokan
  peneliti_metrik.csv  satu baris per peneliti ber-ORCID: jumlah karya, sitasi, h-index
  enrich_log.csv       ringkasan putaran (cakupan, jumlah permintaan)

Prinsip:
- Pencocokan DOI dipercaya penuh; pencocokan judul hanya bila kemiripan >= 0.92 dan tahun selisih <= 1; selebihnya dilewati.
- Semua respons di-cache (CACHE_DIR), sehingga putaran ulang murah dan dapat dilanjutkan.
- Alamat email kontak diambil dari variabel lingkungan BIBLIO_MAILTO (kebijakan "polite pool"); tidak ditulis di kode.
- Alamat dasar API dapat diganti (OPENALEX_BASE, CROSSREF_BASE, ORCID_BASE) untuk uji dengan server tiruan.
"""
import argparse, csv, difflib, hashlib, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error

OA = os.environ.get("OPENALEX_BASE", "https://api.openalex.org").rstrip("/")
CR = os.environ.get("CROSSREF_BASE", "https://api.crossref.org").rstrip("/")
OR = os.environ.get("ORCID_BASE", "https://pub.orcid.org").rstrip("/")
MAILTO = os.environ.get("BIBLIO_MAILTO", "")
OA_KEY = os.environ.get("OPENALEX_API_KEY", "")      # kunci gratis dari openalex.org; dikirim lewat header, tidak ikut ke URL maupun cache
DELAY = float(os.environ.get("BIBLIO_DELAY", "0.12"))
DOI_RX = re.compile(r"10\.\d{4,9}/[^\s\"<>?#]+", re.I)
WORK_FIELDS = "id,doi,title,publication_year,cited_by_count,fwci,citation_normalized_percentile,primary_location,open_access,type"
STATS = {"http": 0, "cache": 0}
CACHE_ONLY = False                                   # --hanya-cache: pakai hasil yang sudah ada, tanpa permintaan baru (mis. saat kuota habis)


_fs = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trg_formspec.py")
import importlib.util as _iu
_sp = _iu.spec_from_file_location("trg_formspec", _fs); _FS = _iu.module_from_spec(_sp); _sp.loader.exec_module(_FS)
clean_orcid = _FS.clean_orcid


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def norm_doi(s):
    m = DOI_RX.search(s or "")
    return re.sub(r"[.,;:)\]}]+$", "", m.group(0)).lower() if m else ""


def get_json(url, cache, headers=None):
    key = os.path.join(cache, hashlib.sha1(url.encode()).hexdigest() + ".json")
    if os.path.exists(key):
        STATS["cache"] += 1
        return json.load(open(key, encoding="utf-8"))
    if CACHE_ONLY:
        return None
    ua = "Unhas-TRG-mapping/1.0" + (f" (mailto:{MAILTO})" if MAILTO else "")
    for attempt in range(4):
        time.sleep(DELAY)
        try:
            auth = {"Authorization": "Bearer " + OA_KEY} if OA_KEY and url.startswith(OA) else {}
            req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "application/json", **auth, **(headers or {})})
            with urllib.request.urlopen(req, timeout=60) as r:
                STATS["http"] += 1
                data = json.loads(r.read().decode("utf-8"))
            json.dump(data, open(key, "w", encoding="utf-8"))
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:                       # tidak ditemukan: catat sebagai kosong agar tidak diulang
                json.dump(None, open(key, "w")); return None
            if e.code == 429:
                body = (e.read() or b"").decode("utf-8", "ignore")
                if "Insufficient budget" in body:
                    sys.exit("OpenAlex: kuota habis (" + ("kunci terpasang" if OA_KEY else "tanpa kunci; set OPENALEX_API_KEY") + "). Respons: " + body[:300])
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt * 2); continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt)
    return None


def q(base, path, **params):
    if MAILTO and base == OA:
        params["mailto"] = MAILTO
    return base + path + "?" + urllib.parse.urlencode(params, safe=":|,/", quote_via=urllib.parse.quote)


def parse_work(w):
    loc = w.get("primary_location") or {}
    src = loc.get("source") or {}
    cnp = w.get("citation_normalized_percentile") or {}
    return dict(openalex_id=(w.get("id") or "").rsplit("/", 1)[-1], doi=norm_doi(w.get("doi")), tahun=w.get("publication_year") or "",
                sitasi=w.get("cited_by_count") if w.get("cited_by_count") is not None else "", fwci=w.get("fwci") if w.get("fwci") is not None else "",
                top10=int(bool(cnp.get("is_in_top_10_percent"))), jurnal=src.get("display_name") or "", issn=src.get("issn_l") or "", issn_semua=";".join(x for x in (src.get("issn") or []) if x),
                oa=int(bool((w.get("open_access") or {}).get("is_oa"))), jenis=w.get("type") or "")


def batches(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def by_doi(dois, cache):
    out = {}
    for b in batches(sorted(dois), 40):
        data = get_json(q(OA, "/works", filter="doi:" + "|".join(b), **{"per-page": 50, "select": WORK_FIELDS}), cache)
        for w in (data or {}).get("results", []):
            p = parse_work(w)
            if p["doi"]:
                out[p["doi"]] = p
    return out


def crossref(doi, cache):
    d = get_json(q(CR, "/works/" + urllib.parse.quote(doi, safe="/"), **({"mailto": MAILTO} if MAILTO else {})), cache)
    m = (d or {}).get("message")
    if not m:
        return None
    yr = ((m.get("issued") or {}).get("date-parts") or [[None]])[0][0]
    return dict(openalex_id="", doi=doi, tahun=yr or "", sitasi=m.get("is-referenced-by-count", ""), fwci="", top10=0,
                jurnal=(m.get("container-title") or [""])[0], issn=(m.get("ISSN") or [""])[0], issn_semua=";".join(m.get("ISSN") or []), oa=0, jenis=m.get("type") or "")


def title_match(title, year, cache):
    d = get_json(q(OA, "/works", filter="title.search:" + re.sub(r"[,|:]", " ", title)[:200], **{"per-page": 3, "select": WORK_FIELDS}), cache)
    best, score = None, 0.0
    for w in (d or {}).get("results", []):
        s = difflib.SequenceMatcher(None, norm_title(title), norm_title(w.get("title"))).ratio()
        if s > score:
            best, score = w, s
    if best and score >= 0.92 and (not year or not best.get("publication_year") or abs(int(year) - int(best["publication_year"])) <= 1):
        return parse_work(best), round(score, 3)
    return None, round(score, 3)


def authors(orcids, cache):
    out = {}
    for b in batches(sorted(orcids), 40):
        d = get_json(q(OA, "/authors", filter="orcid:" + "|".join("https://orcid.org/" + o for o in b),
                       **{"per-page": 50, "select": "id,orcid,display_name,works_count,cited_by_count,summary_stats"}), cache)
        for a in (d or {}).get("results", []):
            o = (a.get("orcid") or "").rsplit("/", 1)[-1]
            ss = a.get("summary_stats") or {}
            out[o] = dict(orcid=o, openalex_author=(a.get("id") or "").rsplit("/", 1)[-1], nama_openalex=a.get("display_name") or "",
                          karya=a.get("works_count", ""), sitasi=a.get("cited_by_count", ""), h_index=ss.get("h_index", ""), i10_index=ss.get("i10_index", ""))
    return out


def orcid_name(o, cache):
    d = get_json(OR + f"/v3.0/{o}/person", cache)
    n = ((d or {}).get("name") or {})
    g, f = ((n.get("given-names") or {}).get("value") or ""), ((n.get("family-name") or {}).get("value") or "")
    return (g + " " + f).strip()


def write(path, head, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=head); w.writeheader(); w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True); ap.add_argument("--out", default="data/trg"); ap.add_argument("--data", default="data/trg")
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--no-title-match", action="store_true"); ap.add_argument("--orcid-verify", action="store_true")
    ap.add_argument("--hanya-cache", action="store_true", help="tanpa permintaan baru; hasil sebagian bila cache belum lengkap")
    a = ap.parse_args()
    global CACHE_ONLY
    CACHE_ONLY = a.hanya_cache
    os.makedirs(a.cache, exist_ok=True); os.makedirs(a.out, exist_ok=True)
    if not MAILTO:
        print("PERINGATAN: BIBLIO_MAILTO belum diisi; OpenAlex/Crossref akan lebih lambat dan dapat membatasi permintaan.", file=sys.stderr)
    pubs = list(csv.DictReader(open(f"{a.data}/publikasi.csv", encoding="utf-8")))
    art = {}
    for r in pubs:
        k = norm_title(r["judul"])
        if len(k) < 12:
            continue
        e = art.setdefault(k, dict(judul=r["judul"], tahun=r["tahun"], dois=set()))
        d = norm_doi(r["url"])
        if d:
            e["dois"].add(d)
    keys = sorted(art)[: a.limit] if a.limit else sorted(art)
    all_dois = {d for k in keys for d in art[k]["dois"]}
    print(f"{len(keys)} artikel unik, {len(all_dois)} DOI unik")
    found = by_doi(all_dois, a.cache)
    rows, via = {}, {"doi": 0, "crossref": 0, "judul": 0, "tidak_cocok": 0}
    for k in keys:
        e = art[k]; hit = None
        for d in sorted(e["dois"]):
            if d in found:
                hit = (found[d], "doi", 1.0); break
        if not hit:
            for d in sorted(e["dois"]):
                c = crossref(d, a.cache)
                if c:
                    hit = (c, "crossref", 1.0); break
        if not hit and not e["dois"] and not a.no_title_match:
            m, s = title_match(e["judul"], e["tahun"], a.cache)
            if m:
                hit = (m, "judul", s)
        if hit:
            via[hit[1]] += 1
            rows[k] = dict(kunci_judul=k, **hit[0], dasar_kecocokan=hit[1], skor_kecocokan=hit[2])
        else:
            via["tidak_cocok"] += 1
    head = ["kunci_judul", "openalex_id", "doi", "tahun", "sitasi", "fwci", "top10", "jurnal", "issn", "issn_semua", "oa", "jenis", "dasar_kecocokan", "skor_kecocokan"]
    write(f"{a.out}/artikel_metrik.csv", head, [rows[k] for k in sorted(rows)])
    people = list(csv.DictReader(open(f"{a.data}/peneliti_unik.csv", encoding="utf-8")))
    raw = [p for p in people if p["orcid"].strip()]
    clean = {p["peneliti_id"]: clean_orcid(p["orcid"]) for p in raw}
    bad = [(p["peneliti_id"], p["nama"], p["orcid"]) for p in raw if not clean[p["peneliti_id"]]]
    if bad:
        write(f"{a.out}/orcid_bermasalah.csv", ["peneliti_id", "nama", "orcid_tertulis"], [dict(peneliti_id=i, nama=n, orcid_tertulis=o) for i, n, o in bad])
        print(f"{len(bad)} ORCID tidak valid (format/checksum); dicatat di orcid_bermasalah.csv", file=sys.stderr)
    orcids = {o for o in clean.values() if o}
    am = authors(orcids, a.cache) if orcids else {}
    idmap = {clean[p["peneliti_id"]]: p for p in raw if clean[p["peneliti_id"]]}
    prow = []
    for o, m in sorted(am.items()):
        m["peneliti_id"] = idmap[o]["peneliti_id"] if o in idmap else ""
        m["nama_kami"] = idmap[o]["nama"] if o in idmap else ""
        if a.orcid_verify:
            m["nama_orcid"] = orcid_name(o, a.cache)
            m["kemiripan_nama"] = round(difflib.SequenceMatcher(None, norm_title(m["nama_kami"]), norm_title(m["nama_orcid"])).ratio(), 2)
        prow.append(m)
    ph = ["peneliti_id", "nama_kami", "orcid", "openalex_author", "nama_openalex", "karya", "sitasi", "h_index", "i10_index"] + (["nama_orcid", "kemiripan_nama"] if a.orcid_verify else [])
    write(f"{a.out}/peneliti_metrik.csv", ph, prow)
    cover = round(100 * (len(keys) - via["tidak_cocok"]) / max(1, len(keys)), 1)
    write(f"{a.out}/enrich_log.csv", ["waktu", "artikel_unik", "cocok_doi", "cocok_crossref", "cocok_judul", "tidak_cocok", "cakupan_pct", "peneliti_orcid", "peneliti_cocok", "http", "cache"],
          [dict(waktu=time.strftime("%Y-%m-%d %H:%M:%S"), artikel_unik=len(keys), cocok_doi=via["doi"], cocok_crossref=via["crossref"], cocok_judul=via["judul"],
                tidak_cocok=via["tidak_cocok"], cakupan_pct=cover, peneliti_orcid=len(orcids), peneliti_cocok=len(am), http=STATS["http"], cache=STATS["cache"])])
    print(f"cocok: {via} | cakupan {cover}% | peneliti OpenAlex {len(am)}/{len(orcids)} | http {STATS['http']}, cache {STATS['cache']}")


if __name__ == "__main__":
    main()

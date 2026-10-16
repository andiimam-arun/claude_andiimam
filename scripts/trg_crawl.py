#!/usr/bin/env python3
"""Crawl data yang tampil publik di https://trg.unhas.ac.id (halaman HTML saja).

Keluaran (CSV) di --out: trg, peneliti, publikasi, buku, paten, proyek, crawl_log.
Email peneliti disimpan terpisah (kontak_peneliti.csv) dan tidak di-commit (.gitignore).

Pemakaian:
  python3 scripts/trg_crawl.py --out data/trg --cache /path/cache [--limit 3]

Sertifikat: server trg.unhas.ac.id tidak mengirim sertifikat perantara GlobalSign,
jadi bundle CA dibangun dari --ca (default /root/.ccr/ca-bundle.crt jika ada, atau
CA sistem) ditambah scripts/certs/globalsign_rsa_ov_ssl_ca_2018.pem. Verifikasi TLS
tidak dimatikan.
"""
import argparse, csv, hashlib, html, json, os, re, ssl, sys, tempfile, threading, time
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = "https://trg.unhas.ac.id"
UA = "Unhas-TRG-mapping/1.0 (research mapping; trg@unhas.ac.id)"
HERE = os.path.dirname(os.path.abspath(__file__))
INTERMEDIATE = os.path.join(HERE, "certs", "globalsign_rsa_ov_ssl_ca_2018.pem")

FACULTY_CLUSTER = {
    "Faculty of Agriculture": "Agro Complex", "Faculty of Animal Husbandry": "Agro Complex",
    "Faculty of Marine & Fisheries": "Agro Complex", "Faculty of Forestry": "Agro Complex",
    "Faculty of Agricultural Technology": "Agro Complex",
    "Faculty of Economics & Business": "Social Science", "Faculty of Social & Political Sciences": "Social Science",
    "Faculty of Law": "Social Science", "Faculty of Cultural Sciences": "Social Science",
    "Faculty of Mathematics & Natural Science": "Science and Engineering", "Faculty of Engineering": "Science and Engineering",
    "Faculty of Medicine": "Medical and Health Science", "Faculty of Dentistry": "Medical and Health Science",
    "Faculty of Public Health": "Medical and Health Science", "Faculty of Pharmacy": "Medical and Health Science",
    "Faculty of Nursing": "Medical and Health Science",
    "Faculty of Vocational": "Vocational", "School of Postgraduate": "Multidisciplinary",
}
SECTIONS = {  # subhalaman -> nama keluaran
    "articles": "publikasi", "books": "buku", "patens": "paten", "research-project": "proyek",
}
ROLE_WORDS = {"leader", "lecturers", "external collaborators", "researchers", "students"}

_lock = threading.Lock()
_last = [0.0]


def make_ctx(ca):
    bundle = tempfile.NamedTemporaryFile("wb", suffix=".pem", delete=False)
    if ca and os.path.exists(ca):
        bundle.write(open(ca, "rb").read())
    else:
        for p in ssl.get_default_verify_paths().cafile, "/etc/ssl/certs/ca-certificates.crt":
            if p and os.path.exists(p):
                bundle.write(open(p, "rb").read()); break
    bundle.write(b"\n" + open(INTERMEDIATE, "rb").read())
    bundle.close()
    return ssl.create_default_context(cafile=bundle.name)


class Fetcher:
    def __init__(self, ctx, cache, delay):
        self.ctx, self.cache, self.delay = ctx, cache, delay
        os.makedirs(cache, exist_ok=True)

    def get(self, url):
        key = os.path.join(self.cache, hashlib.sha1(url.encode()).hexdigest() + ".html")
        if os.path.exists(key):
            return 200, open(key, encoding="utf-8").read()
        status, body = 0, ""
        for attempt in range(4):
            with _lock:  # jeda global antar permintaan
                wait = self.delay - (time.time() - _last[0])
                if wait > 0:
                    time.sleep(wait)
                _last[0] = time.time()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60, context=self.ctx) as r:
                    status, body = r.status, r.read().decode("utf-8", "ignore")
                break
            except urllib.error.HTTPError as e:
                status = e.code
                if e.code in (404, 403, 401):
                    break
                time.sleep(2 ** attempt)
            except Exception:
                status = -1
                time.sleep(2 ** attempt)
        if status == 200:
            open(key, "w", encoding="utf-8").write(body)
        return status, body


def clean(t):
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t).strip()


def strip_noise(s):
    return re.sub(r"(?s)<(script|style|noscript|svg)[^>]*>.*?</\1>", "", s)


def parse_home(s):
    """Urut dokumen: judul fakultas (accordion) dan tautan TRG (h6)."""
    out, faculty, seen = [], "", set()
    pat = re.compile(
        r'e-n-accordion-item-title-text">\s*([^<]+?)\s*</div>'
        r'|<h6[^>]*><a href="(https://trg\.unhas\.ac\.id/[^"]+)">([^<]+)</a>')
    for m in pat.finditer(s):
        if m.group(1):
            faculty = html.unescape(m.group(1)).strip()
        else:
            url = m.group(2).rstrip("/")
            slug = url.replace(BASE + "/", "")
            if slug in seen or "/" in slug:
                continue
            seen.add(slug)
            name = re.sub(r"^\s*\d+\.\s*", "", html.unescape(m.group(3))).strip()
            out.append(dict(cluster=FACULTY_CLUSTER.get(faculty, ""), faculty=faculty,
                            slug=slug, name=name, url=url + "/"))
    return out


ITEM_SPLIT = re.compile(r'<div class="jet-listing-grid__item ')


def parse_items(s):
    """Kembalikan list item: (role_terdekat, fields[list teks], links[list href], name_h3, p_text)."""
    s = strip_noise(s)
    res, role = [], ""
    tok = re.compile(r'<h2[^>]*>([^<]+)</h2>|<div class="jet-listing-grid__item ')
    pos = [(m.start(), m) for m in tok.finditer(s)]
    for i, (st, m) in enumerate(pos):
        if m.group(1) is not None:
            t = m.group(1).strip()
            if t.lower() in ROLE_WORDS:
                role = t
            continue
        end = pos[i + 1][0] if i + 1 < len(pos) else len(s)
        chunk = s[st:end]
        fields = [clean(x) for x in re.findall(r'jet-listing-dynamic-field__content"\s*>(.*?)</div>', chunk, re.S)]
        links = [html.unescape(x) for x in re.findall(r'<a[^>]+href="([^"]+)"', chunk)]
        h3 = re.search(r"<h3[^>]*>(.*?)</h3>", chunk, re.S)
        p = re.search(r"<p[^>]*>(.*?)</p>", chunk, re.S)
        rest = re.sub(r"(?s)<(h3|p)[^>]*>.*?</\1>", "", chunk)
        texts = [clean(x) for x in re.findall(r">([^<>]+)<", rest) if clean(x)]
        res.append(dict(role=role, fields=fields, links=links,
                        name=clean(h3.group(1)) if h3 else "", p=clean(p.group(1)) if p else "",
                        texts=texts))
    return res


def total_pages(s):
    pages = [int(x) for x in re.findall(r'data-page="\d+" data-pages="(\d+)"', s)]
    return max(pages) if pages else 1


def fetch_section(f, slug, sub, log):
    url = f"{BASE}/{slug}/{sub}/"
    st, body = f.get(url)
    log.append((slug, sub, 1, st))
    if st != 200:
        return []
    items = parse_items(body)
    for n in range(2, min(total_pages(body), 60) + 1):
        st, b = f.get(f"{url}?jsf=jet-engine&pagenum={n}")
        log.append((slug, sub, n, st))
        if st == 200:
            items += parse_items(b)
    return items


EXPERTISE_NOISE = re.compile(r"\s*(Envelope|Home|Link|Globe|Phone)(\s+(Envelope|Home|Link|Globe|Phone))*\s*$")
LABEL = re.compile(r"^\s*(Expertise|Institution|Keahlian|Institusi)\s*:?\s*", re.I)


def team_row(slug, it):
    """Dua tata letak: (a) p berisi keahlian; (b) field terpisah keahlian, institusi."""
    vals = it["fields"] if len(it["fields"]) >= 1 else ([it["p"]] + it["texts"] if it["p"] else it["texts"])
    vals = [LABEL.sub("", EXPERTISE_NOISE.sub("", v)).strip() for v in vals]
    vals = [v for v in vals if v and v.lower() not in ("expertise:", "institution:")]
    expertise = vals[0] if vals else ""
    affiliation = vals[1] if len(vals) > 1 else ""
    if len(vals) == 1 and re.search(r"universit|institut|politeknik|fakultas|faculty", vals[0], re.I):
        expertise, affiliation = "", vals[0]  # hanya institusi yang terisi
    ids = dict(scholar="", scopus="", orcid="", sinta="", email="")
    for l in it["links"]:
        low = l.lower()
        if "scholar.google" in low: ids["scholar"] = l
        elif "scopus.com" in low:
            m = re.search(r"authorId=(\d+)", l); ids["scopus"] = m.group(1) if m else l
        elif "orcid.org" in low:
            ids["orcid"] = re.sub(r"^https?://orcid\.org/", "", l)
        elif "sinta" in low:
            m = re.search(r"/profile/(\d+)", l); ids["sinta"] = m.group(1) if m else l
        elif "@" in l and not ids["email"]:
            ids["email"] = l.replace("http://", "").replace("mailto:", "")
    return ([slug, it["role"], it["name"], expertise, affiliation, ids["scopus"], ids["orcid"],
             ids["sinta"], ids["scholar"]], ids["email"])


def crawl_trg(f, t):
    log, rows = [], {"peneliti": [], "kontak": [], "publikasi": [], "buku": [], "paten": [], "proyek": []}
    st, main = f.get(t["url"])
    log.append((t["slug"], "home", 1, st))
    desc = ""
    if st == 200:
        m = re.search(r'(?:property="og:description"|name="description") content="([^"]*)"', main)
        desc = html.unescape(m.group(1)).strip() if m else ""
    t["description"] = desc
    for it in fetch_section(f, t["slug"], "ourteam", log):
        if not it["name"]:
            continue
        row, mail = team_row(t["slug"], it)
        rows["peneliti"].append(row)
        if mail:
            rows["kontak"].append([t["slug"], it["name"], mail])
    for sub, key in SECTIONS.items():
        for it in fetch_section(f, t["slug"], sub, log):
            fl = it["fields"] + [""] * 4
            link = next((l for l in it["links"] if l.startswith("http")), "")
            if key == "publikasi":
                year = next((x for x in it["fields"] if re.fullmatch(r"(19|20)\d{2}", x)), "")
                if not year:
                    m = re.search(r"\b((?:19|20)\d{2})\b", fl[2]); year = m.group(1) if m else ""
                rows[key].append([t["slug"], fl[0], fl[1], fl[2], year, link])
            else:
                rows[key].append([t["slug"], json.dumps(it["fields"], ensure_ascii=False), link])
    t["n_peneliti"] = len(rows["peneliti"])
    t["n_publikasi"] = len(rows["publikasi"])
    t["n_buku"] = len(rows["buku"])
    t["n_paten"] = len(rows["paten"])
    t["n_proyek"] = len(rows["proyek"])
    return t, rows, log


def write(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/trg")
    ap.add_argument("--cache", required=True)
    ap.add_argument("--ca", default="/root/.ccr/ca-bundle.crt")
    ap.add_argument("--delay", type=float, default=0.3)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    f = Fetcher(make_ctx(a.ca), a.cache, a.delay)
    st, home = f.get(BASE + "/")
    if st != 200:
        sys.exit(f"gagal membuka beranda: {st}")
    trgs = parse_home(home)
    if a.limit:
        trgs = trgs[: a.limit]
    print(f"{len(trgs)} TRG ditemukan", flush=True)
    allrows = {k: [] for k in ["peneliti", "kontak", "publikasi", "buku", "paten", "proyek"]}
    alllog, done = [], [0]

    def work(t):
        r = crawl_trg(f, dict(t))
        done[0] += 1
        if done[0] % 10 == 0:
            print(f"  {done[0]}/{len(trgs)}", flush=True)
        return r

    with ThreadPoolExecutor(a.workers) as ex:
        results = list(ex.map(work, trgs))
    meta = []
    for t, rows, log in results:
        meta.append([t["cluster"], t["faculty"], t["slug"], t["name"], t["url"], t["description"],
                     t["n_peneliti"], t["n_publikasi"], t["n_buku"], t["n_paten"], t["n_proyek"]])
        for k in allrows:
            allrows[k] += rows[k]
        alllog += log
    write(f"{a.out}/trg.csv", ["klaster", "fakultas", "slug", "nama", "url", "deskripsi",
                               "n_peneliti", "n_publikasi", "n_buku", "n_paten", "n_proyek"], meta)
    write(f"{a.out}/peneliti.csv", ["trg_slug", "peran", "nama", "keahlian", "afiliasi", "scopus_id", "orcid", "sinta_id", "scholar_url"], allrows["peneliti"])
    write(f"{a.out}/kontak_peneliti.csv", ["trg_slug", "nama", "email"], allrows["kontak"])
    write(f"{a.out}/publikasi.csv", ["trg_slug", "judul", "penulis", "sumber", "tahun", "url"], allrows["publikasi"])
    for k in ("buku", "paten", "proyek"):
        write(f"{a.out}/{k}.csv", ["trg_slug", "fields_json", "url"], allrows[k])
    write(f"{a.out}/crawl_log.csv", ["trg_slug", "bagian", "halaman", "status_http"], alllog)
    print("selesai:", {k: len(v) for k, v in allrows.items()})


if __name__ == "__main__":
    main()

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
ROLE_WORDS = {"leader", "lecturers", "lecturer", "external collaborators", "external collaborator",
              "researchers", "researcher", "students", "student"}

ROLE_RX = [(re.compile(r"^(group\s+)?leader(\s+group|\s+of\b.*|s)?$|^ketua\b|^head of", re.I), "Leader"),
           (re.compile(r"supervising|lecturer|dosen", re.I), "Lecturer"),
           (re.compile(r"external|partner|collaborator|mitra", re.I), "External collaborator"),
           (re.compile(r"researcher|peneliti", re.I), "Researcher"),
           (re.compile(r"student|mahasiswa", re.I), "Student"),
           (re.compile(r"^members?$|^team members?$", re.I), "Member")]


def role_of(text):
    """Judul bagian tim -> peran baku (Leader/Lecturer/...), atau None bila bukan judul peran."""
    t = re.sub(r"\s+", " ", text).strip()
    if not t or len(t) > 45:
        return None
    for rx, name in ROLE_RX:
        if rx.search(t):
            return name
    return None


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
    """Urut dokumen: judul fakultas (accordion) dan semua entri TRG bernomor (h6), dengan atau tanpa tautan.

    Tautan bisa http atau https, bisa menunjuk subhalaman (mis. /sri/wp-admin), situs lain
    (airporteng.mmt.unhas.ac.id), atau tidak ada sama sekali (TRG belum punya halaman).
    """
    out, faculty, seen = [], "", {}
    pat = re.compile(
        r'e-n-accordion-item-title-text">\s*([^<]+?)\s*</div>'
        r'|<h6[^>]*>(.*?)</h6>', re.S)
    for m in pat.finditer(s):
        if m.group(1):
            faculty = html.unescape(m.group(1)).strip()
            continue
        inner = m.group(2)
        text = html.unescape(re.sub(r"<[^>]+>", "", inner)).strip()
        mm = re.match(r"^\s*\d+\.\s*(.+)$", text)
        if not mm:
            continue
        name = re.sub(r"\s+", " ", mm.group(1)).strip()
        href = re.search(r'href="([^"]+)"', inner)
        href = html.unescape(href.group(1)).strip() if href else ""
        slug, url, note = "", "", ""
        if href:
            hm = re.match(r"^https?://([^/]+)/?([^/?#]*)", href)
            host, first = (hm.group(1), hm.group(2)) if hm else ("", "")
            if host == "trg.unhas.ac.id" and first:
                slug, url = first, f"{BASE}/{first}/"
            elif host and host != "trg.unhas.ac.id":
                slug, url, note = host.split(".")[0], f"https://{host}/", "situs_eksternal"
        key = (faculty, name.lower())
        if key in seen:                       # entri ganda dalam fakultas yang sama
            if url and not out[seen[key]]["url"]:
                out[seen[key]].update(slug=slug, url=url, note=note)
            continue
        if not slug:
            slug = "tanpa-halaman-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
            note = "tanpa_halaman"
        base_slug, n = slug, 2
        while any(o["slug"] == slug for o in out):   # dua TRG berbagi satu situs: yang kedua tidak dibaca ulang
            slug, n = f"{base_slug}-{n}", n + 1
            note, url = "situs_dipakai_bersama", ""
        seen[key] = len(out)
        out.append(dict(cluster=FACULTY_CLUSTER.get(faculty, ""), faculty=faculty, slug=slug, name=name,
                        url=url, note=note, site_slug=base_slug))
    return out


AFF = re.compile(r"universit|institut|faculty|fakultas|department|departemen|school|politeknik|college|hospital|rumah sakit", re.I)
ITEM_SPLIT = re.compile(r'<div class="jet-listing-grid__item ')


def parse_items(s):
    """Kembalikan list item: (role_terdekat, fields[list teks], links[list href], name_h3, p_text)."""
    s = strip_noise(s)
    res, role = [], ""
    tok = re.compile(r'<h2[^>]*>([^<]+)</h2>|<div class="jet-listing-grid__item ')
    pos = []
    for m in tok.finditer(s):
        if m.group(1) is not None and not role_of(m.group(1)):
            continue  # h2 bukan judul peran: bagian dari item (nama ketua sering berupa h2)
        pos.append((m.start(), m))
    for i, (st, m) in enumerate(pos):
        if m.group(1) is not None:
            role = role_of(m.group(1))
            continue
        end = pos[i + 1][0] if i + 1 < len(pos) else len(s)
        chunk = s[st:end]
        fields = [clean(x) for x in re.findall(r'jet-listing-dynamic-field__content"\s*>(.*?)</div>', chunk, re.S)]
        links = [html.unescape(x) for x in re.findall(r'<a[^>]+href="([^"]+)"', chunk)]
        h3 = re.search(r"<h3[^>]*>(.*?)</h3>", chunk, re.S)
        h2 = None if h3 else re.search(r"<h2[^>]*>(.*?)</h2>", chunk, re.S)
        p = re.search(r"<p[^>]*>(.*?)</p>", chunk, re.S)
        rest = re.sub(r"(?s)<(h2|h3|p)[^>]*>.*?</\1>", "", chunk)
        texts = [clean(x) for x in re.findall(r">([^<>]+)<", rest) if clean(x)]
        ptxt = clean(p.group(1)) if p else ""
        if h2 and not fields:  # tata letak ketua: nama h2, lalu h4-h6 berisi afiliasi dan keahlian
            hs = [clean(x) for x in re.findall(r"<h[456][^>]*>(.*?)</h[456]>", chunk, re.S)]
            hs = [x for x in hs if x]
            aff = [x for x in hs if AFF.search(x)]
            exp = [x for x in hs if not AFF.search(x)]
            fields = aff[:1]
            ptxt = ptxt or "; ".join(exp)
        res.append(dict(role=role, fields=fields, links=links,
                        name=clean(h3.group(1)) if h3 else (clean(h2.group(1)) if h2 else ""), p=ptxt,
                        texts=texts))
    return res or parse_static_team(s) or parse_linkinbio(s)


def parse_static_team(s):
    """Tata letak statis Elementor (icon-box) tanpa JetEngine: nama h3, keahlian p, ikon sosial."""
    res, role = [], ""
    tok = re.compile(r'<h2[^>]*>([^<]+)</h2>|<div class="elementor-(?:icon|image)-box-wrapper">')
    pos = [(m.start(), m) for m in tok.finditer(s)]
    for i, (st, m) in enumerate(pos):
        if m.group(1) is not None:
            if role_of(m.group(1)):
                role = role_of(m.group(1))
            continue
        end = pos[i + 1][0] if i + 1 < len(pos) else len(s)
        chunk = s[st:end]
        h3 = re.search(r'<(h\d|div|span)[^>]*class="[^"]*-box-title[^"]*"[^>]*>(.*?)</\1>', chunk, re.S) \
            or re.search(r"<h3[^>]*>(.*?)</h3>", chunk, re.S)
        p = re.search(r'<(p|div)[^>]*class="[^"]*-box-description[^"]*"[^>]*>(.*?)</\1>', chunk, re.S) \
            or re.search(r"<p[^>]*>(.*?)</p>", chunk, re.S)
        if not h3:
            continue
        links = [html.unescape(x) for x in re.findall(r'<a[^>]+href="([^"#][^"]*)"', chunk)]
        res.append(dict(role=role, fields=[], links=links, name=clean(h3.group(h3.lastindex)),
                        p=clean(p.group(p.lastindex)) if p else "", texts=[]))
    return res


def parse_linkinbio(s):
    """Widget Elementor 'link in bio': nama (heading), peran (title), keahlian (description), tautan ID."""
    res = []
    parts = re.split(r'<div class="e-link-in-bio__bio"', s)[1:]
    for chunk in parts:
        h = re.search(r'e-link-in-bio__heading[^>]*>(.*?)</h2>', chunk, re.S)
        t = re.search(r'e-link-in-bio__title[^>]*>(.*?)</h3>', chunk, re.S)
        d = re.search(r'e-link-in-bio__description[^>]*>(.*?)</p>', chunk, re.S)
        if not h:
            continue
        links = [html.unescape(x) for x in re.findall(r'<a[^>]+href="([^"#][^"]*)"', chunk[:6000])]
        res.append(dict(role=clean(t.group(1)) if t else "", fields=[], links=links, name=clean(h.group(1)),
                        p=clean(d.group(1)) if d else "", texts=[]))
    return res


def total_pages(s):
    pages = [int(x) for x in re.findall(r'data-page="\d+" data-pages="(\d+)"', s)]
    return max(pages) if pages else 1


STOP_HEAD = re.compile(r"our team|meet our team|we work together|about|important links|useful links|contact|social|information|"
                       r"section title|home|publication|activities|research|news|partners?$|bridging|footer|menu|search", re.I)


def leader_from_headings(s):
    """Cadangan bila ketua tak terbaca oleh parser item: heading nama di bawah judul peran 'Leader'."""
    s = strip_noise(s)
    heads = [(m.start(), clean(m.group(2))) for m in re.finditer(r"<(h[1-6])[^>]*>(.*?)</\1>", s, re.S)]
    for k, (pos, text) in enumerate(heads):
        if role_of(text) != "Leader":
            continue
        for _, cand in heads[k + 1:k + 4]:
            if role_of(cand) or STOP_HEAD.search(cand) or len(cand) > 80 or len(cand.split()) < 2:
                if role_of(cand):
                    break
                continue
            if AFF.search(cand) or re.search(r"\b(leader|professor at|assistant|lecturer)\b", cand, re.I):
                continue
            seg = s[pos:pos + 6000]
            links = [html.unescape(x) for x in re.findall(r'<a[^>]+href="([^"#][^"]*)"', seg)][:8]
            return [dict(role="Leader", fields=[], links=links, name=cand, p="", texts=[])]
    return []


def fetch_section(f, slug, sub, log, base=None):
    url = f"{base or BASE + '/' + slug}/{sub}/"
    st, body = f.get(url)
    log.append((slug, sub, 1, st))
    if st != 200:
        return []
    items = parse_items(body)
    if sub == "ourteam" and not any(it["role"] == "Leader" for it in items):
        lead = leader_from_headings(body)
        if lead:
            same = [it for it in items if it["name"].lower() == lead[0]["name"].lower()]
            if same:
                same[0]["role"] = "Leader"
            else:
                items = lead + items
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
    if it["p"]:  # tata letak umum: <p> berisi keahlian, field dinamis berisi institusi
        vals = [it["p"]] + it["fields"]
    else:
        vals = it["fields"] if it["fields"] else it["texts"]
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
    if not t["url"]:  # TRG tanpa halaman: tidak ada yang bisa dibaca
        for k in ("n_peneliti", "n_publikasi", "n_buku", "n_paten", "n_proyek"):
            t[k] = 0
        t["description"] = ""
        log.append((t["slug"], "home", 0, "tanpa_halaman"))
        return t, rows, log
    site = t["url"].rstrip("/")
    st, main = f.get(t["url"])
    log.append((t["slug"], "home", 1, st))
    desc = ""
    if st == 200:
        m = re.search(r'(?:property="og:description"|name="description") content="([^"]*)"', main)
        desc = html.unescape(m.group(1)).strip() if m else ""
    t["description"] = desc
    for it in fetch_section(f, t["slug"], "ourteam", log, site):
        if not it["name"]:
            continue
        row, mail = team_row(t["slug"], it)
        rows["peneliti"].append(row)
        if mail:
            rows["kontak"].append([t["slug"], it["name"], mail])
    for sub, key in SECTIONS.items():
        for it in fetch_section(f, t["slug"], sub, log, site):
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
                     t["n_peneliti"], t["n_publikasi"], t["n_buku"], t["n_paten"], t["n_proyek"], t["note"]])
        for k in allrows:
            allrows[k] += rows[k]
        alllog += log
    write(f"{a.out}/trg.csv", ["klaster", "fakultas", "slug", "nama", "url", "deskripsi",
                               "n_peneliti", "n_publikasi", "n_buku", "n_paten", "n_proyek", "catatan"], meta)
    write(f"{a.out}/peneliti.csv", ["trg_slug", "peran", "nama", "keahlian", "afiliasi", "scopus_id", "orcid", "sinta_id", "scholar_url"], allrows["peneliti"])
    write(f"{a.out}/kontak_peneliti.csv", ["trg_slug", "nama", "email"], allrows["kontak"])
    write(f"{a.out}/publikasi.csv", ["trg_slug", "judul", "penulis", "sumber", "tahun", "url"], allrows["publikasi"])
    for k in ("buku", "paten", "proyek"):
        write(f"{a.out}/{k}.csv", ["trg_slug", "fields_json", "url"], allrows[k])
    write(f"{a.out}/crawl_log.csv", ["trg_slug", "bagian", "halaman", "status_http"], alllog)
    print("selesai:", {k: len(v) for k, v in allrows.items()})


if __name__ == "__main__":
    main()

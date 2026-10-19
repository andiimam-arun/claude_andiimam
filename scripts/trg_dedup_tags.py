#!/usr/bin/env python3
"""Deduplikasi peneliti lintas TRG dan usulan tag keahlian dari data/trg/*.csv.

Keluaran di data/trg:
  peneliti_unik.csv         satu baris per orang (kunci: ORCID/SINTA/Scopus, lalu nama ternormalisasi)
  peneliti_review.csv       penggabungan berdasar nama saja lintas klaster (perlu dicek manual)
  usulan_tag.csv            tag keahlian terbersih + frekuensi + varian penulisan
  peneliti_tag.csv          relasi peneliti_id -> tag
  trg_tema.csv              tema tiap TRG dari namanya
"""
import csv, re, collections as C

D = "data/trg"
R = lambda f: list(csv.DictReader(open(f"{D}/{f}.csv", encoding="utf-8")))
pen, trg = R("peneliti"), R("trg")
tinfo = {t["slug"]: t for t in trg}

# ---------- normalisasi nama ----------
TITLES = {"prof", "dr", "drs", "dra", "ir", "h", "hj", "ns", "apt", "dr-ing", "drg", "dr.", "dott", "mr", "mrs", "ms",
          "assoc", "asst", "associate", "professor", "dato", "datuk", "kh", "ust"}
DEGREES = {"sp", "spd", "msi", "mp", "mt", "st", "se", "sh", "mh", "ssi", "skm", "mkes", "mkm", "mm", "msc", "phd",
           "mhum", "mpd", "mscphd", "mba", "mcom", "spt", "sstp", "mpt", "ma", "ms", "mph", "md", "sked", "spog",
           "mhs", "sfarm", "mfarm", "skep", "mkep", "mkeb", "mkom", "skom", "mit", "mmath", "msm", "mtech", "ssos",
           "ssi", "sip", "msi", "sap", "ak", "ca", "cpa", "sik", "mkesm", "mhk", "sphut", "mphil", "sfil", "sh", "llm",
           "sos", "mpa", "msp", "sant", "spi", "spk", "mscpt", "dds", "spdgig", "sppd", "kic", "ap", "bsc", "bs", "dm"}


ABBR = {"muh": "muhammad", "mhd": "muhammad", "moh": "mohammad", "abd": "abdul"}


def norm_name(n):
    n = n.replace("​", " ").lower()
    n = re.sub(r"[^\w\s,.\-]", " ", n)
    n = n.split(",")[0]                       # gelar belakang biasanya setelah koma
    toks = [re.sub(r"[.\-]", "", t) for t in n.replace(".", ". ").split()]
    toks = [t for t in toks if t]
    while toks and toks[0] in TITLES:
        toks.pop(0)
    while toks and toks[-1] in DEGREES:
        toks.pop()
    toks = [ABBR.get(t, t) for t in toks]
    out = []
    for t in toks:                            # "asman asman" -> "asman"
        if not out or out[-1] != t:
            out.append(t)
    return " ".join(out)


# ---------- union-find ----------
parent = list(range(len(pen)))
def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i
def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[rb] = ra

for p in pen:
    p["_key"] = norm_name(p["nama"])
idx = C.defaultdict(list)
for i, p in enumerate(pen):
    for col in ("orcid", "sinta_id", "scopus_id"):
        v = p[col].strip()
        if v:
            idx[(col, v)].append(i)
for ids in idx.values():
    for j in ids[1:]:
        union(ids[0], j)
id_groups = {find(i) for i in range(len(pen))}
# penggabungan nama (>=2 token)
byname = C.defaultdict(list)
for i, p in enumerate(pen):
    if len(p["_key"].split()) >= 2:
        byname[p["_key"]].append(i)
review = []
for key, ids in byname.items():
    roots = {find(i) for i in ids}
    if len(roots) > 1 or len(ids) > 1:
        clusters = {tinfo[pen[i]["trg_slug"]]["klaster"] for i in ids}
        hasid = [i for i in ids if any(pen[i][c] for c in ("orcid", "sinta_id", "scopus_id"))]
        # konflik: dua ID berbeda pada nama sama -> jangan gabung
        conflict = any(len({pen[i][c].strip() for i in ids if pen[i][c].strip()}) > 1
                       for c in ("orcid", "sinta_id", "scopus_id"))
        if conflict:
            review.append([key, "ID_berbeda_nama_sama", len(ids), "; ".join(sorted({pen[i]["trg_slug"] for i in ids}))])
            continue
        for j in ids[1:]:
            union(ids[0], j)
        if len(clusters) > 1 and not hasid:
            review.append([key, "nama_saja_lintas_klaster", len(ids), "; ".join(sorted({pen[i]["trg_slug"] for i in ids}))])

# ---------- KETUA DULU: tempelkan varian nama ke baris ketua TRG ----------
IDCOLS = ("orcid", "sinta_id", "scopus_id")
is_leader = lambda i: pen[i]["peran"].strip().lower() == "leader"
def cluster_map():
    g = C.defaultdict(list)
    for i in range(len(pen)):
        g[find(i)].append(i)
    return g
def ids_of(ix, col):
    return {pen[i][col].strip() for i in ix if pen[i][col].strip()}
def tokens_of(ix):
    return {tuple(pen[i]["_key"].split()) for i in ix if pen[i]["_key"]}
def compatible(a, b):
    """a, b: tuple token nama. Sama, atau yang pendek adalah awalan (urut) dari yang panjang."""
    if a == b: return True
    s_, l_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(s_) >= 2 and l_[:len(s_)] == s_
fuzzy_attached = 0
for _ in range(2):                          # dua putaran agar rantai gabungan stabil
    g = cluster_map()
    leader_roots = [r for r, ix in g.items() if any(is_leader(i) for i in ix)]
    for lr in leader_roots:
        lix = g[lr]
        if find(lr) != lr and find(lix[0]) != find(lr):
            continue
        lt = tokens_of([i for i in lix if is_leader(i)])
        for r2, ix2 in list(cluster_map().items()):
            if find(r2) == find(lr):
                continue
            if any(is_leader(i) for i in ix2):      # dua ketua berbeda tidak digabung otomatis
                continue
            if any(ids_of(lix, c) and ids_of(ix2, c) and not (ids_of(lix, c) & ids_of(ix2, c)) for c in IDCOLS):
                continue
            tt = tokens_of(ix2)
            hit = [(a, b) for a in lt for b in tt if compatible(a, b)]
            if not hit:
                continue
            shortest = min(min(len(a), len(b)) for a, b in hit)
            if shortest >= 3:
                union(lix[0], ix2[0]); fuzzy_attached += 1
            else:
                review.append([" ".join(hit[0][0]) + " ~ " + " ".join(hit[0][1]), "nama_mirip_2kata_ketua", len(ix2),
                               "; ".join(sorted({pen[i]["trg_slug"] for i in lix + ix2}))])

# ---------- bersihkan keahlian -> tag ----------
EMAIL = re.compile(r"\S+@\S+")
BAD = re.compile(r"universit|institut|faculty|fakultas|department|departemen|hospital|school|college|lecturer|student|degree|"
                 r"focus research|ph\.?d|bachelor|master|doctor|llc|polytechnic|politeknik|rumah sakit|ministry|"
                 r"hasanuddin|unhas|makassar|indonesia|usa|japan|australia|malaysia|centre|center for|laboratory|"
                 r"program studi|prodi|mahasiswa|dosen|professor|peneliti$|researcher$|expertise|institution|^research$|"
                 r"x{3,}|instansi|bidang keahlian|agency|badan|brin\b|graduate|magister|collaborator|national research|"
                 r"^s[123]$|^n/?a$|^-+$|^none$|^tidak ada$|please select|team member|^focus|nigeria|\btrg\b|^none", re.I)
SYN = {"pertanian": "agriculture", "kelautan": "marine", "perikanan": "fisheries", "kesehatan masyarakat": "public health",
       "kehutanan": "forestry", "peternakan": "animal husbandry", "hukum": "law", "ekonomi": "economics",
       "akuntansi": "accounting", "keperawatan": "nursing", "farmasi": "pharmacy", "kedokteran": "medicine",
       "teknik sipil": "civil engineering", "pangan": "food", "lingkungan": "environment", "gizi": "nutrition",
       "kakao": "cocoa", "kopi": "coffee", "padi": "rice", "jagung": "corn", "tanah": "soil", "hama": "pest"}


def clean_phrase(x):
    x = EMAIL.sub("", x).strip(" -•·:;.,​\n\t")
    x = re.sub(r"\s+", " ", x)
    return x


def tags_of(s):
    out = []
    for ph in re.split(r"[;,/\n•|]", EMAIL.sub("", s)):
        ph = clean_phrase(ph)
        if len(ph) < 3 or len(ph) > 60 or BAD.search(ph) or re.fullmatch(r"[\d\W]+", ph):
            continue
        out.append(ph)
    return out


def tagkey(ph):
    k = ph.lower()
    for a, b in SYN.items():
        k = re.sub(rf"\b{a}\b", b, k)
    k = re.sub(r"[^a-z0-9 ]", " ", k)
    toks = [re.sub(r"(ies)$", "y", t) if len(t) > 4 else t for t in k.split()]
    toks = [t[:-1] if len(t) > 4 and t.endswith("s") and not t.endswith(("ss", "us", "is")) else t for t in toks]
    toks = [t for t in toks if t not in {"and", "of", "the", "for", "in", "dan", "untuk", "science", "sciences", "ilmu"}]
    return " ".join(sorted(toks))


# ---------- bangun peneliti unik ----------
groups = C.defaultdict(list)
for i in range(len(pen)):
    groups[find(i)].append(i)
rows, ptag, tagstat = [], [], C.defaultdict(lambda: dict(variants=C.Counter(), people=set(), trgs=set()))
for n, (root, ids) in enumerate(sorted(groups.items(), key=lambda kv: kv[1][0]), 1):
    pid = f"P{n:05d}"
    ps = [pen[i] for i in ids]
    lead_rows = [p for p in ps if p["peran"].strip().lower() == "leader"]
    best = max(lead_rows or ps, key=lambda p: len(p["nama"]))["nama"]   # nama kanonik: dari baris ketua bila ada
    by_id = any(len(idx.get((c, p[c].strip()), [])) > 1 for p in ps for c in ("orcid", "sinta_id", "scopus_id") if p[c].strip())
    first = lambda c: next((p[c] for p in ps if p[c].strip()), "")
    tags = []
    for p in ps:
        tags += tags_of(p["keahlian"])
    keys = {}
    for t in tags:
        keys.setdefault(tagkey(t), t)
    for k, t in keys.items():
        if not k:
            continue
        ptag.append([pid, k])
        st = tagstat[k]
        st["people"].add(pid)
        st["trgs"].update(p["trg_slug"] for p in ps)
    for t in tags:
        if tagkey(t):
            tagstat[tagkey(t)]["variants"][t] += 1
    roles = sorted({p["peran"].title() for p in ps if p["peran"]})
    order = ["Leader", "Lecturer", "Researcher", "Member", "External Collaborator", "Student"]
    top = next((r for r in order if r.lower() in {x.lower() for x in roles}), roles[0] if roles else "")
    lead_slugs = sorted({p["trg_slug"] for p in lead_rows})
    trgs = lead_slugs + sorted({p["trg_slug"] for p in ps} - set(lead_slugs))   # TRG yang dipimpin didahulukan
    ketua_di = " · ".join(re.sub(r" Research Group$", "", tinfo[x]["nama"]).strip() for x in lead_slugs)
    klas = sorted({tinfo[s]["klaster"] for s in trgs})
    rows.append([pid, best, norm_name(best), len(trgs), ";".join(trgs), ";".join(klas), ";".join(roles),
                 " | ".join(dict.fromkeys(t for t in tags)), first("scopus_id"), first("orcid"), first("sinta_id"),
                 first("scholar_url"), "id" if by_id else ("nama" if len(ps) > 1 else "tunggal"), top, ketua_di, ";".join(lead_slugs)])

hdr = ["peneliti_id", "nama", "nama_norm", "n_trg", "trg_slugs", "klaster", "peran", "keahlian_bersih",
       "scopus_id", "orcid", "sinta_id", "scholar_url", "dasar_penggabungan", "peran_tertinggi", "ketua_di", "ketua_slugs"]
def write(f, h, r):
    with open(f"{D}/{f}", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(h); w.writerows(r)
write("peneliti_unik.csv", hdr, rows)
write("peneliti_review.csv", ["nama_norm", "alasan", "n_baris", "trg_slugs"], sorted(review))
write("peneliti_tag.csv", ["peneliti_id", "tag_key"], ptag)
tr = []
for k, st in sorted(tagstat.items(), key=lambda kv: -len(kv[1]["people"])):
    best = st["variants"].most_common(1)[0][0]
    tr.append([k, best, len(st["people"]), len(st["trgs"]),
               " | ".join(v for v, _ in st["variants"].most_common(6))])
write("usulan_tag.csv", ["tag_key", "label_usulan", "n_peneliti", "n_trg", "varian"], tr)
write("trg_tema.csv", ["slug", "fakultas", "klaster", "tema"],
      [[t["slug"], t["fakultas"], t["klaster"], re.sub(r"\s*\(?research\s*g?r?o?u?p\)?\s*$", "", t["nama"], flags=re.I).strip()] for t in trg])

STOP = set("""the of and in on for to a an with by from at as is are was were be this that these those using use based
study studies analysis effect effects impact approach evaluation assessment case development potential application applications
south sulawesi indonesia indonesian makassar new its their between among through during into under over vol no pp journal
dan di ke dari yang untuk pada dengan dalam terhadap oleh atau sebagai antara analisis pengaruh studi kajian penerapan
pengembangan berbasis melalui serta sebuah kota kabupaten provinsi sulawesi selatan indonesia research group review
model system systems method methods performance quality management""".split())
def words(t):
    return [w for w in re.findall(r"[a-zA-Z][a-zA-Z\-]{2,}", t.lower()) if w not in STOP]
titles = C.defaultdict(list)
for r in R("publikasi"):
    titles[r["trg_slug"]].append(r["judul"])
import json
for r in R("proyek"):
    try:
        f = json.loads(r["fields_json"])
        if f: titles[r["trg_slug"]].append(f[0])
    except Exception:
        pass
kw = []
for t in trg:
    uni, bi = C.Counter(), C.Counter()
    for ti in titles[t["slug"]]:
        w = words(ti)
        uni.update(set(w)); bi.update(set(zip(w, w[1:])))
    top = [(" ".join(k), c) for k, c in bi.most_common(6) if c >= 2] + [(k, c) for k, c in uni.most_common(8) if c >= 3]
    kw.append([t["slug"], t["nama"], len(titles[t["slug"]]), " | ".join(f"{k} ({c})" for k, c in top[:10])])
write("trg_kata_kunci.csv", ["slug", "nama", "n_judul", "kata_kunci_dari_judul"], kw)
print("baris peneliti", len(pen), "-> orang unik", len(rows), "| ketua:", sum(1 for r in rows if r[-1]), "| varian nama ditempel ke ketua:", fuzzy_attached)
print(C.Counter(r[12] for r in rows))
print("tag unik", len(tr), "| tag dipakai >=2 peneliti:", sum(1 for r in tr if r[2] >= 2), "| >=5:", sum(1 for r in tr if r[2] >= 5))
print("review", len(review), C.Counter(r[1] for r in review))
print("peneliti dgn >=1 tag", len({p for p, _ in ptag}))
print([r[:4] for r in tr[:25]])

#!/usr/bin/env python3
"""Draf tag Tingkat 1 (taksonomi luas) dan pemetaan TRG -> tag dari nama TRG + kata kunci judul.

Keluaran di data/trg:
  tag_tier1.csv       daftar tag (id, nama ID/EN, klaster, definisi, n_trg)
  trg_tag_tier1.csv   pemetaan TRG -> maksimal 3 tag, dengan skor dan tanda perlu_review
Ini DRAF otomatis berbasis aturan kata kunci; wajib disunting manusia.
"""
import csv, re, collections as C

D = "data/trg"
R = lambda f: list(csv.DictReader(open(f"{D}/{f}.csv", encoding="utf-8")))
trg, kw = R("trg"), {r["slug"]: r for r in R("trg_kata_kunci")}

# id, nama_id, name_en, klaster, definisi, pola regex (nama TRG berbobot 3, kata kunci judul bobot 1)
TAGS = [
 ("A01", "Tanaman pangan & hortikultura", "Food crops & horticulture", "Agro", "Padi, jagung, sayur, buah, anggrek, pemuliaan tanaman",
  r"rice|corn|maize|horticult|orchid|food crop|taro|chili|pepper|tomato|plant breeding|breeding and biotech|sago|banana|citrus|tanaman pangan"),
 ("A02", "Perkebunan", "Plantation crops", "Agro", "Kakao, kopi, kelapa sawit, tanaman tahunan",
  r"cocoa|coffee|oil palm|plantation|clove|cacao|kakao|kopi"),
 ("A03", "Perlindungan tanaman (hama & penyakit)", "Plant protection", "Agro", "Hama, penyakit, biokontrol, patogen tanaman",
  r"pest|pathogen|disease management|phytophthora|mycolog|bacteriolog|biocontrol|biopesticide|entomolog|insect|termite|fungi|dieback"),
 ("A04", "Tanah, lahan & pertanian presisi", "Soil, land & precision agriculture", "Agro", "Fisika/kualitas tanah, lahan suboptimal, geospasial, pertanian presisi",
  r"soil|land use|sub-optimal land|precision agri|geospatial|land management|karst"),
 ("A05", "Peternakan", "Livestock", "Agro", "Ternak, pakan, susu, genetik ternak, unggas",
  r"livestock|dairy|poultry|beef|goat|equine|milk|feed|leather|ternak|animal production"),
 ("A06", "Perikanan & akuakultur", "Fisheries & aquaculture", "Agro", "Budidaya, perikanan tangkap, penyakit ikan, udang, kepiting, rumput laut",
  r"fisher|aquacultur|shrimp|crab|lobster|tilapia|tuna|shark|fish and shellfish|seaweed|algal|multitrophic|sea cucumber|fishing"),
 ("A07", "Ekosistem pesisir & laut", "Coastal & marine ecosystems", "Agro", "Terumbu karang, lamun, mangrove, konservasi laut, tata ruang laut, sampah laut",
  r"coral|seagrass|mangrove|coastal|marine|ocean|reef|aquatic|biodiversity and conservation|marine plastic|spatial planning|blue econom"),
 ("A08", "Kehutanan & konservasi biodiversitas", "Forestry & biodiversity conservation", "Agro", "Hutan, DAS, satwa liar, hasil hutan bukan kayu, ekowisata hutan",
  r"forest|wildlife|watershed|non-timber|deforestation|biomass|tropical ecology|biodiversity conservation|ecotourism"),
 ("A09", "Teknologi & pengolahan pangan", "Food technology & processing", "Agro", "Pengolahan, pascapanen, pangan fungsional, fermentasi, kemasan",
  r"food process|post-?harvest|functional food|ferment|food packaging|ethnic food|nutritional enrichment|food technology|appropriate agricultural technology|natural fiber"),
 ("A10", "Sosial-ekonomi & kelembagaan pertanian", "Agricultural socio-economics & institutions", "Agro", "Rantai nilai, kelembagaan petani, agribisnis, modal sosial",
  r"value chain|agribusiness|farmers|institution strengthening|social capital|agricultural institution|smallholder"),
 ("B01", "Ekonomi, bisnis & manajemen", "Economics, business & management", "Sosial", "Pemasaran, SDM, rantai pasok, model bisnis, UMKM, ekonomi pembangunan",
  r"marketing|human resource|supply chain|business model|market dynamics|sme|small and medium|development economics|resource economics|business transformation|emerging markets|non-market|economics and gender|microfinance"),
 ("B02", "Akuntansi, keuangan & tata kelola", "Accounting, finance & governance", "Sosial", "Akuntansi, audit, pelaporan, anggaran publik, tata kelola korporasi, ekonomi syariah",
  r"accounting|audit|financial|budget|governance research|corporate governance|islamic economics|accountab|transparency|forensic accounting"),
 ("B03", "Hukum", "Law", "Sosial", "Hukum pidana, bisnis, agraria/pesisir, lingkungan, hak anak/disabilitas",
  r"\blaw\b|legal|criminolog|justice|constitution|regulation|victim|sociolegal"),
 ("B04", "Pemerintahan, politik & kebijakan publik", "Governance, politics & public policy", "Sosial", "Demokrasi, organisasi publik, kebijakan lingkungan, tata kelola maritim",
  r"democracy|public organization|government|public opinion|environmental policy|maritime governance|public administration|modernization|policy"),
 ("B05", "Media, komunikasi & masyarakat digital", "Media, communication & digital society", "Sosial", "Komunikasi, media digital, perilaku sosial",
  r"media|communication|digital society|digital media|social behavior"),
 ("B06", "Antropologi, masyarakat & pembangunan komunitas", "Anthropology, society & community development", "Sosial", "Antropologi maritim/bisnis, masyarakat pesisir, migrasi, konflik sumber daya",
  r"anthropolog|coastal community|migration|human security|community development|conflict and natural|peace|terroris"),
 ("B07", "Disabilitas & inklusi sosial", "Disability & social inclusion", "Sosial", "Disabilitas, kelompok rentan, gender",
  r"disabilit|inclusion|vulnerable|gender"),
 ("B08", "Bahasa, sastra & budaya", "Language, literature & culture", "Sosial", "Linguistik, sastra, pembelajaran bahasa, budaya lokal, naskah, arkeologi",
  r"linguistic|language|literature|culture|cultural|manuscript|prehistor|arabic|french|english|psycholinguistic|tourism|local wisdom|ethno"),
 ("C01", "Matematika & statistika", "Mathematics & statistics", "Sains-Teknik", "Aljabar, analisis, teori graf, pemodelan stokastik, statistika",
  r"algebra|graph theory|fixed point|functional analysis|stochastic|statistic|quaternion|mathematical model|mathematics"),
 ("C02", "Sains data & kecerdasan buatan", "Data science & AI", "Sains-Teknik", "AI, pembelajaran mesin, data mining, pengolahan multimedia",
  r"artificial intelligence|\bai\b|data science|data mining|machine learning|multimedia|intelligent|computing"),
 ("C03", "Material, fisika & nanoteknologi", "Materials, physics & nanotechnology", "Sains-Teknik", "Material fungsional, nanokomposit, semikonduktor, fisika medis, material ringan",
  r"material|nano|semiconductor|polymer|bionanocomposite|medical physics|functionally graded|lightweight|biochar|metallurg|rare-earth|rare earth"),
 ("C04", "Kimia & bahan alam", "Chemistry & natural products", "Sains-Teknik", "Kimia bahan alam laut, sintesis obat, kimia medisinal, metabolomik",
  r"natural product|chemistry|drug synthesis|medicinal chemistry|metabolomic|nutraceutical|cosmeceutical|bioprospecting"),
 ("C05", "Energi terbarukan & transisi energi", "Renewable energy & energy transition", "Sains-Teknik", "Hidrogen hijau, surya, energi laut, efisiensi energi, sistem tenaga, limbah ke energi",
  r"energy|hydrogen|renewable|power system|grid|waste to energy|high voltage|solar|insulation|nanogenerator|harvesting"),
 ("C06", "Struktur, geoteknik & kebencanaan", "Structural, geotechnical & disaster resilience", "Sains-Teknik", "Struktur tahan gempa, geoteknik, banjir, longsor, likuifaksi, bencana global",
  r"earthquake|structural|geotechn|flood|liquefaction|flowslide|hazard|disaster|resilien|infrastructure|piping|strengthening"),
 ("C07", "Transportasi, kota & permukiman", "Transport, urban & settlement", "Sains-Teknik", "Transportasi, bandara, permukiman, kota tangguh, arsitektur dan bangunan",
  r"transport|airport|settlement|housing|urban|facade|daylighting|building acoustics|architecture|multimodal|public transport"),
 ("C08", "Lingkungan, persampahan & polusi", "Environment, waste & pollution", "Sains-Teknik", "Persampahan, kebisingan, kualitas udara, ekotoksikologi, dampak lingkungan",
  r"solid waste|waste management|noise|air pollution|air quality|ecotoxicology|environmental impact|contamination|environmental sustainab"),
 ("C09", "Iklim, geosains & sumber daya bumi", "Climate, geoscience & earth resources", "Sains-Teknik", "Pemodelan iklim, paleoenvironment, sumber daya mineral",
  r"climate|earth resources|paleoenvironment|geolog|geochemi|mining"),
 ("C10", "Robotika, elektronika & sistem siber", "Robotics, electronics & cyber systems", "Sains-Teknik", "Mekatronika, robotika, IoT, siber, kapal pintar",
  r"robot|mechatronic|internet of things|\biot\b|cyber|smart ship|navigation|aerodynamic|fluid dynamics|applied mechanics|floating structure|mechanical design"),
 ("D01", "Penyakit menular, vaksin & resistensi", "Infectious disease, vaccines & resistance", "Kesehatan", "TB, malaria, pneumonia, superbug, mikrobioma, entomologi kesehatan",
  r"infectious|tb\b|biovax|malaria|vaccine|pneumonia|biofilm|superbug|microbiome|vector|entomology|tuberculosis|infection"),
 ("D02", "Kanker & onkologi", "Cancer & oncology", "Kesehatan", "Tumor tulang, imuno-onkologi, keperawatan onkologi, pencegahan kanker",
  r"tumor|oncolog|cancer|neuro-oncology|malignant"),
 ("D03", "Kesehatan ibu, anak & gizi", "Maternal, child health & nutrition", "Kesehatan", "Neonatal, gizi ibu dan anak, obesitas anak, kohort kelahiran, stunting",
  r"neonatal|mother and child|obesity|child nutrition|birth cohort|maternity|pediatric|stunting|nutrition for|women"),
 ("D04", "Penyakit tidak menular & metabolik", "Non-communicable & metabolic disease", "Kesehatan", "Kardiovaskular, metabolik, ginjal, diabetes, pencernaan, penuaan sehat",
  r"non-communicable|ncd|metabolic|cardiovascular|nephro|renal|diabetic|digestive|oxidative stress|healthy aging|geriatric|functional food for"),
 ("D05", "Kesehatan lingkungan, K3 & iklim", "Environmental & occupational health", "Kesehatan", "K3, toksikologi lingkungan, air bersih, dampak iklim pada kesehatan",
  r"occupational|safety and health|workplace|environmental toxicology|health risk|domestic water|climate crisis and health|urban health|environmental impact assessment|fatigue"),
 ("D06", "Epidemiologi & sistem kesehatan", "Epidemiology & health systems", "Kesehatan", "Epidemiologi spasial/sosial, pemodelan kesehatan, manajemen RS, mutu layanan",
  r"epidemiolog|health model|hospital|healthcare quality|nursing management|syndemic|pharmacoepidemiology|medical education"),
 ("D07", "Kedokteran gigi & kesehatan mulut", "Dentistry & oral health", "Kesehatan", "Periodonsia, bedah mulut, kedokteran gigi regeneratif/forensik/geriatri",
  r"dental|dentistry|periodontal|oral|orofacial|oromaxillofacial|adhesive"),
 ("D08", "Keperawatan & kesehatan jiwa", "Nursing & mental health", "Kesehatan", "Keperawatan holistik, kesehatan jiwa, manajemen nyeri dan luka",
  r"nursing|mental health|pain management|wound|diabetic foot|psychology"),
 ("D09", "Farmasi, obat & bahan alam", "Pharmacy, drugs & natural products", "Kesehatan", "Penemuan obat bahan alam, sistem penghantaran obat, keamanan obat",
  r"pharma|drug|medication|transdermal|transmucosal|natural product drug|unhas fly"),
 ("D10", "Biomedis & kedokteran regeneratif", "Biomedicine & regenerative medicine", "Kesehatan", "Regenerasi tulang, neurogenetika, imunologi, biodental",
  r"regenerat|neurogenetic|bone|immun|biodental|tissue|genetic"),
]
FACULTY_DEFAULT = {
 "Faculty of Agriculture": "A01", "Faculty of Animal Husbandry": "A05", "Faculty of Marine & Fisheries": "A06",
 "Faculty of Forestry": "A08", "Faculty of Agricultural Technology": "A09", "Faculty of Economics & Business": "B01",
 "Faculty of Social & Political Sciences": "B04", "Faculty of Law": "B03", "Faculty of Cultural Sciences": "B08",
 "Faculty of Mathematics & Natural Science": "C01", "Faculty of Engineering": "C06", "Faculty of Medicine": "D01",
 "Faculty of Dentistry": "D07", "Faculty of Public Health": "D06", "Faculty of Pharmacy": "D09", "Faculty of Nursing": "D08",
}

pat = {t[0]: re.compile(t[5], re.I) for t in TAGS}
rows, cnt = [], C.Counter()
for t in trg:
    name = t["nama"]
    kws = kw.get(t["slug"], {}).get("kata_kunci_dari_judul", "")
    sc, byname = {}, set()
    for tid, rx in pat.items():
        n_hit = len(rx.findall(name))
        s = 3 * n_hit + min(len(rx.findall(kws)), 4)
        if s:
            sc[tid] = s
        if n_hit:
            byname.add(tid)
    if byname:  # bila nama TRG sudah menunjuk tag, abaikan tag yang hanya muncul dari kata kunci judul
        sc = {k: v for k, v in sc.items() if k in byname}
    top = sorted(sc.items(), key=lambda kv: -kv[1])[:3]
    top = [kv for kv in top if kv[1] >= (top[0][1] / 2)] if top else []
    review = ""
    if not top:
        d = FACULTY_DEFAULT.get(t["fakultas"])
        top = [(d, 0)] if d else []
        review = "tag_dari_fakultas_saja"
    elif top[0][1] < 3:
        review = "hanya_dari_kata_kunci"
    for tid, _ in top:
        cnt[tid] += 1
    rows.append([t["slug"], t["nama"], t["fakultas"], ";".join(tid for tid, _ in top),
                 ";".join(str(s) for _, s in top), review])
with open(f"{D}/trg_tag_tier1.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["slug", "nama", "fakultas", "tag_ids", "skor", "perlu_review"])
    w.writerows(rows)
with open(f"{D}/tag_tier1.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["tag_id", "nama_id", "name_en", "klaster", "definisi", "n_trg"])
    for t in TAGS:
        w.writerow([t[0], t[1], t[2], t[3], t[4], cnt[t[0]]])
print("TRG:", len(rows), "| perlu_review:", C.Counter(r[5] for r in rows))
for t in TAGS:
    print(f"  {t[0]} {t[1]}: {cnt[t[0]]}")

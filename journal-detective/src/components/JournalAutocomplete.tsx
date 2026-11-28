"use client";
import { useEffect, useRef, useState } from "react";

interface Hit { id: string; sourceId: string | null; title: string; issn: string | null; eissn: string | null; status: string; coverage: string | null; publisher: string | null; publisherGroup: string | null; discontinuedQuality: boolean; hasConflicts: boolean }
interface Meta { versionLabel: string; observationDate: string; isDemo: boolean }

export interface FieldNames { title: string; issn: string; eissn?: string; sourceId?: string; publisher?: string; country?: string }
interface Props { lang: "id" | "en"; names: FieldNames; mode: "investigation" | "application"; defaults?: Partial<Record<keyof FieldNames, string>>; prefillNote?: Meta | null }

const STATUS: Record<string, { id: string; en: string; cls: string }> = {
  ACTIVE: { id: "Active", en: "Active", cls: "border-green-300 bg-ok-soft text-ok-ink" },
  INACTIVE: { id: "Inactive", en: "Inactive", cls: "border-slate-300 bg-slate-100 text-slate-700" },
  ACCEPTED: { id: "Accepted (belum otomatis aktif)", en: "Accepted (not automatically active)", cls: "border-amber-300 bg-warn-soft text-warn-ink" },
  UNKNOWN: { id: "Status tidak jelas", en: "Unclear status", cls: "border-slate-300 bg-slate-100 text-slate-700" },
};

/** Autocomplete nama jurnal & ISSN dari database referensi Scopus (impor). Hasil = data impor historis, BUKAN verifikasi langsung. */
export function JournalIdentityFields({ lang, names, mode, defaults = {}, prefillNote = null }: Props) {
  const L = lang === "id";
  const [v, setV] = useState({ title: defaults.title ?? "", issn: defaults.issn ?? "", eissn: defaults.eissn ?? "", sourceId: defaults.sourceId ?? "", publisher: defaults.publisher ?? "", country: defaults.country ?? "" });
  const [hits, setHits] = useState<Hit[]>([]);
  const [meta, setMeta] = useState<Meta | null>(prefillNote);
  const [active, setActive] = useState<"title" | "issn" | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [noImport, setNoImport] = useState(false);
  const [picked, setPicked] = useState<Hit | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const search = (q: string, field: "title" | "issn") => {
    if (timer.current) clearTimeout(timer.current);
    setActive(field);
    if (q.trim().length < 2) { setHits([]); setNotFound(false); return; }
    timer.current = setTimeout(async () => {
      const my = ++seq.current;
      try {
        const r = await fetch(`/api/scopus/search?q=${encodeURIComponent(q)}`);
        if (!r.ok || my !== seq.current) return;
        const j = await r.json();
        setMeta(j.import);
        setNoImport(!j.import);
        setHits(j.results);
        setNotFound(!!j.import && j.results.length === 0 && (field === "issn" || q.trim().length >= 4));
      } catch { /* jaringan lokal gagal: abaikan, isian manual tetap bisa dipakai */ }
    }, 250);
  };

  const pick = (h: Hit) => {
    setV({ title: h.title, issn: mode === "application" ? [h.issn, h.eissn].filter(Boolean).join(" ") : h.issn ?? "", eissn: h.eissn ?? "", sourceId: h.sourceId ?? "", publisher: h.publisher ?? "", country: v.country });
    setPicked(h); setHits([]); setNotFound(false); setActive(null);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const st = picked ? STATUS[picked.status] ?? STATUS.UNKNOWN : null;
  const dropdown = (field: "title" | "issn") => active === field && (hits.length > 0 || notFound || noImport) && (
    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-300 bg-white shadow-lg" role="listbox" aria-label={L ? "Saran dari database Scopus" : "Suggestions from the Scopus database"}>
      {noImport && <div className="px-3 py-2 text-xs text-slate-600">{L ? "Belum ada impor Scopus; saran tidak tersedia. Isi manual — status indeksasi akan BELUM TERVERIFIKASI." : "No Scopus import yet; suggestions unavailable. Fill in manually — indexing will be UNVERIFIED."}</div>}
      {notFound && <div className="px-3 py-2 text-xs text-slate-700">{L ? `Tidak ditemukan dalam impor Scopus ${meta?.versionLabel ?? ""} — belum terverifikasi (bukan berarti tidak terindeks).` : `Not found in the Scopus ${meta?.versionLabel ?? ""} import — unverified (not necessarily unindexed).`}</div>}
      {hits.map((h) => (
        <button key={h.id} type="button" role="option" aria-selected="false" onClick={() => pick(h)} className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-navy-50 focus:bg-navy-50">
          <span className="font-semibold text-navy-900">{h.title}</span>
          <span className="ml-2 font-mono text-[11px] text-slate-500">{h.issn ?? "—"} / {h.eissn ?? "—"} · {h.sourceId ?? "—"}</span>
          <span className="block text-[11px] text-slate-600">{(STATUS[h.status] ?? STATUS.UNKNOWN)[L ? "id" : "en"]}{h.coverage ? ` · ${h.coverage}` : ""}{h.publisher ? ` · ${h.publisher}` : ""}{h.discontinuedQuality ? ` · ${L ? "dihentikan: kualitas" : "discontinued: quality"}` : ""}{h.hasConflicts ? ` · ${L ? "ada konflik data" : "data conflict"}` : ""}</span>
        </button>
      ))}
      {meta && hits.length > 0 && <div className="bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">{L ? `Berdasarkan impor Scopus ${meta.versionLabel} — data historis, bukan verifikasi langsung.` : `Based on the Scopus ${meta.versionLabel} import — historical data, not live verification.`}</div>}
    </div>
  );
  const lbl = "label";
  return (
    <>
      <div className="relative md:col-span-2">
        <label><span className={lbl}>{mode === "investigation" ? (L ? "Judul jurnal *" : "Journal title *") : (L ? "Nama jurnal *" : "Journal name *")}</span>
          <input className="input" name={names.title} required minLength={3} value={v.title} autoComplete="off" onChange={(e) => { setV({ ...v, title: e.target.value }); setPicked(null); search(e.target.value, "title"); }} onFocus={() => setActive("title")} onKeyDown={(e) => { if (e.key === "Escape") { setHits([]); setNotFound(false); } }} placeholder={L ? "Ketik nama jurnal untuk melihat saran dari impor Scopus" : "Type a journal name to see suggestions from the Scopus import"} aria-autocomplete="list" /></label>
        {dropdown("title")}
      </div>
      <div className="relative">
        <label><span className={lbl}>{mode === "investigation" ? "ISSN" : "ISSN / E-ISSN"}</span>
          <input className="input" name={names.issn} value={v.issn} autoComplete="off" placeholder="0000-0000 / 00000000" onChange={(e) => { setV({ ...v, issn: e.target.value }); setPicked(null); search(e.target.value, "issn"); }} onFocus={() => setActive("issn")} onKeyDown={(e) => { if (e.key === "Escape") { setHits([]); setNotFound(false); } }} /></label>
        {dropdown("issn")}
      </div>
      {names.eissn && <label><span className={lbl}>E-ISSN</span><input className="input" name={names.eissn} value={v.eissn} onChange={(e) => setV({ ...v, eissn: e.target.value })} placeholder="0000-0000" /></label>}
      {names.sourceId && <label><span className={lbl}>Scopus Source ID</span><input className="input" name={names.sourceId} value={v.sourceId} onChange={(e) => setV({ ...v, sourceId: e.target.value })} /></label>}
      {names.publisher && <label><span className={lbl}>{L ? "Penerbit" : "Publisher"}</span><input className="input" name={names.publisher} value={v.publisher} onChange={(e) => setV({ ...v, publisher: e.target.value })} /></label>}
      {names.country && <label><span className={lbl}>{L ? "Negara" : "Country"}</span><input className="input" name={names.country} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} /></label>}
      {(picked || prefillNote) && meta && (
        <div className="rounded-lg border border-navy-200 bg-navy-50 p-3 text-xs text-navy-900 md:col-span-2" role="status">
          <div className="flex flex-wrap items-center gap-2">
            <b>{L ? `Berdasarkan impor Scopus ${meta.versionLabel}` : `Based on the Scopus ${meta.versionLabel} import`}</b> ({L ? "pengamatan" : "observed"} {meta.observationDate}) — {L ? "data historis, BUKAN verifikasi langsung" : "historical data, NOT live verification"}
            {st && <span className={`rounded-md border px-2 py-0.5 font-semibold ${st.cls}`}>{st[L ? "id" : "en"]}</span>}
            {picked?.discontinuedQuality && <span className="rounded-md border border-red-300 bg-bad-soft px-2 py-0.5 font-semibold text-bad-ink">{L ? "ditandai dihentikan karena kualitas" : "flagged discontinued for quality"}</span>}
            {picked?.hasConflicts && <span className="rounded-md border border-amber-300 bg-warn-soft px-2 py-0.5 font-semibold text-warn-ink">{L ? "ada konflik data — perlu tinjauan" : "data conflict — needs review"}</span>}
          </div>
          <p className="mt-1">{L ? "Identitas dan bukti indeksasi akan diisi otomatis saat investigasi dijalankan. Indeksasi dari impor tidak membuktikan situs pengiriman autentik maupun klirens akhir." : "Identity and indexing evidence are filled automatically when the investigation runs. Indexing from the import does not prove the submission website is authentic nor grant final clearance."}</p>
        </div>
      )}
    </>
  );
}

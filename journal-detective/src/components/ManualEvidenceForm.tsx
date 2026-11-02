"use client";
import { useState } from "react";
import { addEvidenceAction } from "@/app/actions/investigations";
import { PREDATORY_INDICATORS_LIST } from "@/lib/constants";

const KINDS: Array<[string, string, string]> = [
  ["scopus.coverage", "Scopus — status cakupan", "Scopus — coverage status"],
  ["scimago.entry", "SCImago — kuartil/SJR", "SCImago — quartile/SJR"],
  ["national.accreditation", "Akreditasi nasional (mis. SINTA)", "National accreditation (e.g., SINTA)"],
  ["identity.official_domain", "Domain/situs resmi jurnal", "Official journal domain/site"],
  ["identity.corroboration", "Korroborasi identitas (sumber resmi)", "Identity corroboration (official source)"],
  ["hijack.website", "Hasil perbandingan situs (klon/migrasi/otentik)", "Website comparison (clone/migration/authentic)"],
  ["hijack.issn_reuse", "ISSN dipakai situs tak terkait", "ISSN reused by unrelated site"],
  ["hijack.identity_impersonation", "Peniruan identitas terkonfirmasi", "Confirmed identity impersonation"],
  ["beall.match", "Kecocokan daftar Beall (historis)", "Beall list match (historical)"],
  ["predatory.indicator", "Indikator praktik penerbitan", "Publishing-practice indicator"],
  ["metadata.doaj", "DOAJ (manual)", "DOAJ (manual)"],
  ["metadata.cope", "Keanggotaan COPE", "COPE membership"],
];

export function ManualEvidenceForm({ journalId, back, lang, submittedDomain }: { journalId: string; back: string; lang: "id" | "en"; submittedDomain?: string | null }) {
  const [kind, setKind] = useState("scopus.coverage");
  const id = lang === "id";
  return (
    <form action={addEvidenceAction} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="journalId" value={journalId} />
      <input type="hidden" name="back" value={back} />
      <label className="md:col-span-2"><span className="label">{id ? "Jenis bukti" : "Evidence type"}</span>
        <select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([k, a, b]) => <option key={k} value={k}>{id ? a : b}</option>)}
        </select></label>

      {kind === "scopus.coverage" && (<>
        <label><span className="label">{id ? "Status" : "Status"}</span><select className="input" name="coverage">
          <option value="ACTIVE">{id ? "Aktif" : "Active"}</option><option value="DISCONTINUED">{id ? "Dihentikan (discontinued)" : "Discontinued"}</option>
          <option value="ON_HOLD">{id ? "Ditahan (on hold)" : "On hold"}</option><option value="NOT_LISTED">{id ? "Tidak terdaftar (konklusif, dari sumber resmi)" : "Not listed (conclusive, official source)"}</option></select></label>
        <label><span className="label">{id ? "Tahun akhir cakupan (bila dihentikan)" : "Coverage end year (if discontinued)"}</span><input className="input" name="coverageTo" /></label>
      </>)}
      {kind === "scimago.entry" && (<>
        <label><span className="label">{id ? "Kuartil" : "Quartile"}</span><select className="input" name="quartile"><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option></select></label>
        <label><span className="label">SJR</span><input className="input" name="sjr" /></label>
        <label><span className="label">{id ? "Tahun laporan" : "Report year"}</span><input className="input" name="year" type="number" min={1999} max={2100} /></label>
      </>)}
      {kind === "national.accreditation" && (<>
        <label><span className="label">{id ? "Terakreditasi?" : "Accredited?"}</span><select className="input" name="accredited"><option value="yes">{id ? "Ya" : "Yes"}</option><option value="no">{id ? "Tidak" : "No"}</option></select></label>
        <label><span className="label">{id ? "Peringkat (mis. SINTA 2)" : "Level (e.g., SINTA 2)"}</span><input className="input" name="level" /></label>
      </>)}
      {kind === "identity.official_domain" && (
        <label className="md:col-span-2"><span className="label">{id ? "Domain/URL resmi (pisahkan koma)" : "Official domains/URLs (comma separated)"}</span><input className="input" name="domains" placeholder="https://jurnal-resmi.example" required /></label>
      )}
      {kind === "hijack.website" && (<>
        <label><span className="label">{id ? "Hasil" : "Result"}</span><select className="input" name="relation">
          <option value="CONFIRMED_CLONE">{id ? "Klon/dibajak — TERKONFIRMASI" : "Cloned/hijacked — CONFIRMED"}</option>
          <option value="AUTHORIZED_MIGRATION">{id ? "Migrasi domain sah" : "Authorized domain migration"}</option>
          <option value="MATCHES_OFFICIAL">{id ? "Cocok dengan situs resmi" : "Matches official site"}</option></select></label>
        <label><span className="label">{id ? "Domain yang diajukan" : "Submitted domain"}</span><input className="input" name="submittedDomain" defaultValue={submittedDomain ?? ""} required /></label>
      </>)}
      {kind === "predatory.indicator" && (
        <label className="md:col-span-2"><span className="label">{id ? "Indikator" : "Indicator"}</span><select className="input" name="indicator">
          {PREDATORY_INDICATORS_LIST.map((i) => <option key={i} value={i}>{i}</option>)}</select></label>
      )}
      {kind === "beall.match" && <label><span className="label">{id ? "Tahun daftar" : "List year"}</span><input className="input" name="year" type="number" /></label>}

      <label className="md:col-span-2"><span className="label">{id ? "Temuan *" : "Finding *"}</span><input className="input" name="finding" required /></label>
      <label><span className="label">{id ? "Status bukti" : "Evidence status"}</span><select className="input" name="status">
        <option value="VERIFIED">{id ? "TERVERIFIKASI (wajib ada URL/referensi)" : "VERIFIED (URL/reference required)"}</option>
        <option value="REPORTED_UNVERIFIED">{id ? "Dilaporkan, belum terverifikasi" : "Reported, unverified"}</option>
        <option value="NOT_FOUND">{id ? "Tidak ditemukan" : "Not found"}</option><option value="CONFLICTED">{id ? "Konflik" : "Conflicted"}</option></select></label>
      <label><span className="label">{id ? "Tingkat keparahan" : "Severity"}</span><select className="input" name="severity" defaultValue="">
        <option value="">{id ? "(otomatis)" : "(auto)"}</option><option>INFO</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
      <label><span className="label">{id ? "Nama sumber *" : "Source name *"}</span><input className="input" name="sourceName" required placeholder="Scopus Sources / Halaman penerbit / Retraction Watch" /></label>
      <label><span className="label">{id ? "URL sumber" : "Source URL"}</span><input className="input" name="sourceUrl" type="url" placeholder="https://" /></label>
      <label><span className="label">{id ? "Referensi dokumen terunggah / catatan" : "Uploaded-document reference / note"}</span><input className="input" name="sourceRef" /></label>
      <label><span className="label">{id ? "Tanggal data sumber" : "Source data date"}</span><input className="input" name="sourceDataDate" type="date" /></label>
      <label className="md:col-span-2"><span className="label">{id ? "Kutipan bukti" : "Extracted evidence"}</span><input className="input" name="extracted" /></label>
      <label className="md:col-span-2"><span className="label">{id ? "Penjelasan" : "Explanation"}</span><textarea className="input" name="explanation" rows={2} /></label>
      <div className="md:col-span-2"><button className="btn-primary" type="submit">{id ? "Catat bukti manual" : "Record manual evidence"}</button>
        <span className="ml-3 text-xs text-slate-500">{id ? "Tidak boleh mengarang sumber. Bukti VERIFIED tanpa tautan/referensi ditolak." : "Do not invent sources. VERIFIED evidence without a link/reference is rejected."}</span></div>
    </form>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/engine/util";
import type { MergeSummary } from "@/lib/engine/scopusImport";
import { searchScopus, currentImport } from "@/lib/services/scopusReference";
import { confirmScopusImportAction, cancelScopusImportAction } from "@/app/actions/admin";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "amber" | "slate" | "red" | "navy"> = { CONFIRMED: "green", PREVIEW: "amber", SUPERSEDED: "slate", CANCELLED: "slate", FAILED: "red" };
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default async function ScopusDatabase({ searchParams }: { searchParams: Promise<{ q?: string; preview?: string; notice?: string; error?: string }> }) {
  const user = await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ lang }, sp] = await Promise.all([getT(), searchParams]);
  const L = lang === "id";
  const canImport = user.role === "ADMIN" || user.role === "HEAD";
  const [cur, history, preview] = await Promise.all([
    currentImport(),
    prisma.scopusImport.findMany({ orderBy: { uploadedAt: "desc" }, take: 20 }),
    sp.preview && canImport ? prisma.scopusImport.findUnique({ where: { id: sp.preview } }) : null,
  ]);
  const q = (sp.q ?? "").trim();
  const found = q ? await searchScopus(q, 25) : null;
  const sum = preview ? parseJson<MergeSummary & { identicalToImportId?: string | null }>(preview.summaryJson, null as any) : null;
  const t = sum?.totals;
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={L ? "Database Referensi Scopus" : "Scopus Reference Database"}
        subtitle={L ? "Impor workbook Scopus Source List sekali, lalu cari jurnal dengan nama atau ISSN tanpa memasukkan bukti satu per satu. Database ini TERPISAH dari Journal Passport: Passport baru dibuat saat sebuah jurnal diperiksa. Semua hasil adalah data impor historis, bukan verifikasi langsung." : "Import the Scopus Source List workbook once, then search journals by name or ISSN without entering evidence one by one. This database is SEPARATE from the Journal Passport: a Passport is created only when a journal is investigated. All results are historical imported data, not live verification."} />

      <Card className="mb-6"><CardHeader title={L ? "Impor terkini" : "Current import"} />
        <CardBody>{cur ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="label">{L ? "Versi" : "Version"}</dt><dd className="font-semibold">{cur.versionLabel}{cur.isDemo && <Pill tone="amber" className="ml-2">FIKTIF</Pill>}</dd></div>
            <div><dt className="label">{L ? "Tanggal pengamatan data" : "Data observation date"}</dt><dd>{fmtDate(cur.observationDate)}</dd></div>
            <div><dt className="label">{L ? "Baris tersimpan" : "Stored records"}</dt><dd>{cur.recordCount.toLocaleString()}</dd></div>
            <div><dt className="label">{L ? "Berkas" : "File"}</dt><dd className="break-all">{cur.fileName} ({mb(cur.fileSize)})</dd></div>
            <div><dt className="label">SHA-256</dt><dd className="break-all font-mono text-xs">{cur.sha256}</dd></div>
            <div><dt className="label">{L ? "Asal URL" : "Source URL"}</dt><dd className="break-all text-xs">{cur.sourceUrl ?? (L ? "unggah manual" : "manual upload")}</dd></div>
            <div><dt className="label">{L ? "Diimpor" : "Imported"}</dt><dd>{fmtDate(cur.confirmedAt, true)} · {cur.importedByName}</dd></div>
          </dl>
        ) : <p className="text-sm text-slate-700">{L ? "Belum ada impor. Jurnal yang diperiksa akan berstatus indeksasi BELUM TERVERIFIKASI sampai workbook diimpor." : "No import yet. Investigated journals will show indexing as UNVERIFIED until a workbook is imported."}</p>}</CardBody></Card>

      {canImport && !preview && (
        <Card className="mb-6"><CardHeader title={L ? "Langkah 1 — Unggah workbook Scopus (.xlsx)" : "Step 1 — Upload the Scopus workbook (.xlsx)"} subtitle={L ? "Gunakan workbook asli apa adanya. Sheet Sources/Discontinued/Accepted dan baris header dideteksi otomatis dari nama kolom. Anda akan melihat pratinjau sebelum apa pun disimpan." : "Use the original workbook as-is. Sources/Discontinued/Accepted sheets and header rows are detected automatically from column names. You will see a preview before anything is stored."} />
          <CardBody>
            <form action="/api/scopus/import/preview" method="post" encType="multipart/form-data" className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2"><span className="label">{L ? "Berkas workbook *" : "Workbook file *"}</span><input className="input" type="file" name="file" accept=".xlsx" required /></label>
              <label><span className="label">{L ? "Label versi *" : "Version label *"}</span><input className="input" name="versionLabel" required defaultValue="September 2026" /></label>
              <label><span className="label">{L ? "Tanggal pengamatan data * (perkiraan: awal bulan versi)" : "Data observation date * (approx.: start of version month)"}</span><input className="input" type="date" name="observationDate" required defaultValue="2026-09-01" max={new Date().toISOString().slice(0, 10)} /></label>
              <label className="md:col-span-2"><span className="label">{L ? "Asal URL (dicatat sebagai asal-usul)" : "Source URL (recorded as provenance)"}</span><input className="input" type="url" name="sourceUrl" defaultValue="https://downloads.ctfassets.net/o78em1y1w4i4/7xtaTxNiNcWRTeZkV86eNy/e6b17b29beaf8d18175591a4e8dee0bf/ext_list_Sep_2026.xlsx" /></label>
              <div className="md:col-span-2"><button className="btn-primary" type="submit">{L ? "Unggah & buat pratinjau" : "Upload & create preview"}</button>
                <span className="ml-3 text-xs text-slate-500">{L ? "Berkas besar dapat memerlukan beberapa menit. Biarkan halaman terbuka." : "Large files may take a few minutes. Keep this page open."}</span></div>
            </form>
            <p className="mt-3 text-xs text-slate-600">{L ? "Pastikan Anda berhak memakai berkas ini sesuai ketentuan sumber. Aplikasi tidak mengunduh dari internet dan tidak mengirim berkas ke pihak luar." : "Make sure you may use this file under the source's terms. The app does not download from the internet and does not send the file anywhere."}</p>
          </CardBody></Card>
      )}

      {preview && sum && t && (
        <Card className="mb-6 border-2 border-amber-300"><CardHeader title={L ? "Langkah 2 — Pratinjau impor (belum disimpan)" : "Step 2 — Import preview (not stored yet)"} subtitle={preview.status === "PREVIEW" ? (L ? "Periksa angka, konflik, dan kesalahan, lalu konfirmasi atau batalkan." : "Review counts, conflicts and errors, then confirm or cancel.") : `Status: ${preview.status}`} />
          <CardBody className="space-y-5">
            {sum.identicalToImportId && <Notice kind="warn">{L ? "Berkas ini identik (SHA-256 sama) dengan impor sebelumnya. Mengonfirmasi akan membuat riwayat baru." : "This file is identical (same SHA-256) to a previous import. Confirming creates a new history entry."}</Notice>}
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="label">{L ? "Berkas" : "File"}</dt><dd className="break-all">{preview.fileName} ({mb(preview.fileSize)})</dd></div>
              <div><dt className="label">SHA-256</dt><dd className="break-all font-mono text-xs">{preview.sha256}</dd></div>
              <div><dt className="label">{L ? "Versi / pengamatan" : "Version / observation"}</dt><dd>{preview.versionLabel} · {fmtDate(preview.observationDate)}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3"><dt className="label">{L ? "Asal URL" : "Source URL"}</dt><dd className="break-all text-xs">{preview.sourceUrl ?? "—"}</dd></div>
            </dl>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {([[L ? "Baris valid (Sources)" : "Valid rows (Sources)", t.sources], [L ? "Record hasil gabung" : "Merged records", t.records], [L ? "Duplikat" : "Duplicates", t.duplicates], [L ? "Konflik" : "Conflicts", t.conflicts], [L ? "Kesalahan baris" : "Row errors", t.errors], [L ? "Peringatan" : "Warnings", t.warnings]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 p-3"><div className="text-2xl font-extrabold text-navy-950">{v.toLocaleString()}</div><div className="text-xs text-slate-600">{k}</div></div>))}
            </div>
            <div className="text-xs text-slate-700">
              Discontinued: {t.discontinuedRows.toLocaleString()} {L ? "baris" : "rows"} → {t.discontinuedMatched.toLocaleString()} {L ? "digabung ke Sources" : "merged into Sources"}, {t.discontinuedStandalone.toLocaleString()} {L ? "berdiri sendiri" : "standalone"} · Accepted: {t.acceptedRows.toLocaleString()} ({t.acceptedStandalone.toLocaleString()} {L ? "status tersendiri (diterima untuk ditambahkan, bukan aktif)" : "separate status (accepted for addition, not active)"}) · {L ? "Status" : "Status"}: {Object.entries(sum.statusCounts).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(", ")}
            </div>
            <div><h3 className="mb-1 text-sm font-bold">{L ? "Sheet & header terdeteksi" : "Detected sheets & headers"}</h3>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="th">Sheet</th><th className="th">{L ? "Peran" : "Role"}</th><th className="th">{L ? "Baris header" : "Header row"}</th><th className="th">{L ? "Baris data" : "Data rows"}</th><th className="th">{L ? "Valid / galat" : "Valid / errors"}</th><th className="th">{L ? "Kolom dipetakan" : "Mapped columns"}</th><th className="th">{L ? "Kolom tak dikenal (disimpan sbg data tambahan)" : "Unmapped columns (kept as extra data)"}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{sum.sheets.map((s) => (<tr key={s.name}><td className="td">{s.name}</td><td className="td"><Pill tone="navy">{s.role}</Pill></td><td className="td">{s.headerRow}</td><td className="td">{s.rowsRead.toLocaleString()}</td><td className="td">{s.validRows.toLocaleString()} / {s.errorRows}</td>
                  <td className="td">{Object.entries(s.mapping).map(([f, h]) => `${f} ← "${h}"`).join("; ")}</td><td className="td text-slate-500">{s.unmappedHeaders.join("; ") || "—"}</td></tr>))}
                  {sum.ignoredSheets.map((s) => (<tr key={s.name} className="bg-slate-50"><td className="td">{s.name}</td><td className="td" colSpan={6}><Pill>{L ? "diabaikan" : "ignored"}</Pill> {s.reason}</td></tr>))}</tbody></table></div></div>
            {Object.keys(sum.qualityFlagValues).length > 0 && <p className="text-xs text-slate-700"><b>{L ? "Nilai kolom 'Titles Discontinued by Scopus'" : "'Titles Discontinued by Scopus' values"}:</b> {Object.entries(sum.qualityFlagValues).map(([k, v]) => `"${k}" ×${v}`).join(", ")} — {L ? "Inactive tanpa penanda ini TIDAK dianggap dihentikan karena kualitas." : "Inactive without this flag is NOT treated as quality-discontinued."}</p>}
            {Object.keys(sum.conflictsByType).length > 0 && (
              <div><h3 className="mb-1 text-sm font-bold">{L ? "Konflik untuk ditinjau" : "Conflicts for review"} <span className="font-normal text-slate-500">({Object.entries(sum.conflictsByType).map(([k, v]) => `${k}: ${v}`).join(", ")})</span></h3>
                <ul className="max-h-56 list-disc space-y-1 overflow-auto pl-5 text-xs">{sum.conflictSamples.map((c, i) => <li key={i}><b>{c.type}</b> — {c.title} ({c.sourceId ?? "—"}): {c.detail}</li>)}</ul>
                <p className="mt-1 text-xs text-slate-500">{L ? "Record berkonflik tetap tersimpan, ditandai, dan menghasilkan bukti berstatus KONFLIK (perlu tinjauan) saat jurnal diperiksa." : "Conflicting records are kept, flagged, and yield CONFLICTED evidence (needs review) when the journal is investigated."}</p></div>)}
            {sum.errorSamples.length > 0 && (<div><h3 className="mb-1 text-sm font-bold">{L ? "Kesalahan (baris dilewati)" : "Errors (rows skipped)"}</h3><ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs">{sum.errorSamples.map((e, i) => <li key={i}>{e.sheet} · {L ? "baris" : "row"} {e.row}: {e.message}</li>)}</ul></div>)}
            {Object.keys(sum.warningCounts).length > 0 && <p className="text-xs text-slate-700"><b>{L ? "Peringatan" : "Warnings"}:</b> {Object.entries(sum.warningCounts).map(([k, v]) => `${k} ×${v}`).join(", ")}</p>}
            {sum.duplicateSamples.length > 0 && <p className="text-xs text-slate-700"><b>{L ? "Contoh Source ID duplikat (baris pertama dipakai)" : "Duplicate Source ID samples (first row used)"}:</b> {sum.duplicateSamples.slice(0, 8).map((d) => `${d.sourceId} (${d.rows.join(", ")})`).join("; ")}</p>}
            {preview.status === "PREVIEW" && (
              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                <form action={confirmScopusImportAction}><input type="hidden" name="importId" value={preview.id} /><button className="btn-ok" type="submit">{L ? "Konfirmasi & simpan impor" : "Confirm & store import"}</button></form>
                <form action={cancelScopusImportAction}><input type="hidden" name="importId" value={preview.id} /><button className="btn-outline" type="submit">{L ? "Batalkan (tidak ada yang disimpan)" : "Cancel (nothing stored)"}</button></form>
                <p className="w-full text-xs text-slate-600">{L ? "Konfirmasi menyimpan semua record lalu menjadikan impor ini yang terkini. Impor lama dan semua penilaian lama dipertahankan. Proses dapat memakan beberapa menit untuk berkas besar." : "Confirming stores all records and makes this import current. Previous imports and all earlier assessments are kept. This may take a few minutes for large files."}</p>
              </div>)}
          </CardBody></Card>
      )}

      <Card className="mb-6"><CardHeader title={L ? "Cari di database referensi" : "Search the reference database"} subtitle={L ? "Nama jurnal, ISSN/E-ISSN (dengan atau tanpa tanda hubung), atau Source ID." : "Journal name, ISSN/E-ISSN (with or without hyphen), or Source ID."} />
        <CardBody>
          <form method="get" className="mb-4 flex gap-2"><input className="input max-w-md" name="q" defaultValue={q} placeholder="Scientific Reports / 2045-2322 / 21100200805" aria-label="search" /><button className="btn-primary" type="submit">{L ? "Cari" : "Search"}</button></form>
          {found && (found.import ? (
            found.results.length ? (
              <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">{L ? "Judul" : "Title"}</th><th className="th">Source ID</th><th className="th">ISSN / E-ISSN</th><th className="th">Status</th><th className="th">Coverage</th><th className="th">{L ? "Penerbit" : "Publisher"}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{found.results.map((r) => (<tr key={r.id}><td className="td"><Link className="font-semibold text-navy-800 underline" href={`/sources/scopus/${r.id}`}>{r.title}</Link></td><td className="td font-mono text-xs">{r.sourceId ?? "—"}</td><td className="td font-mono text-xs">{r.issn ?? "—"} / {r.eissn ?? "—"}</td>
                  <td className="td"><Pill tone={r.status === "ACTIVE" ? "green" : r.status === "ACCEPTED" ? "amber" : "slate"}>{r.status}</Pill>{r.discontinuedQuality && <Pill tone="red" className="ml-1">{L ? "dihentikan: kualitas" : "disc.: quality"}</Pill>}{r.hasConflicts && <Pill tone="amber" className="ml-1">{L ? "konflik" : "conflict"}</Pill>}</td>
                  <td className="td text-xs">{r.coverage ?? "—"}</td><td className="td text-xs">{r.publisher ?? "—"}{r.publisherGroup ? ` (${r.publisherGroup})` : ""}</td></tr>))}</tbody></table>
                <p className="mt-2 text-xs text-slate-500">{L ? `Berdasarkan impor ${found.import.versionLabel} (pengamatan ${fmtDate(found.import.observationDate)}) — data historis, bukan verifikasi langsung.` : `Based on the ${found.import.versionLabel} import (observed ${fmtDate(found.import.observationDate)}) — historical data, not live verification.`}</p></div>
            ) : <p className="text-sm text-slate-700">{L ? `Tidak ditemukan dalam impor ${found.import.versionLabel} — belum terverifikasi (bukan berarti tidak terindeks).` : `Not found in the ${found.import.versionLabel} import — unverified (not necessarily unindexed).`}</p>
          ) : <p className="text-sm text-slate-700">{L ? "Belum ada impor." : "No import yet."}</p>)}
        </CardBody></Card>

      <Card><CardHeader title={L ? "Riwayat impor" : "Import history"} /><div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">{L ? "Versi" : "Version"}</th><th className="th">Status</th><th className="th">{L ? "Berkas / SHA-256" : "File / SHA-256"}</th><th className="th">{L ? "Pengamatan" : "Observed"}</th><th className="th">{L ? "Record" : "Records"}</th><th className="th">{L ? "Diunggah oleh" : "Uploaded by"}</th><th className="th" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{history.map((h) => (<tr key={h.id}><td className="td">{h.versionLabel}{h.isCurrent && <Pill tone="green" className="ml-1">{L ? "terkini" : "current"}</Pill>}</td><td className="td"><Pill tone={STATUS_TONE[h.status] ?? "slate"}>{h.status}</Pill></td>
          <td className="td text-xs">{h.fileName}<div className="font-mono text-[11px] text-slate-500">{h.sha256.slice(0, 16)}…</div></td><td className="td text-xs">{fmtDate(h.observationDate)}</td><td className="td">{h.recordCount.toLocaleString()}</td><td className="td text-xs">{h.importedByName}<div className="text-slate-500">{fmtDate(h.uploadedAt, true)}</div></td>
          <td className="td">{canImport && h.status === "PREVIEW" && <Link className="text-xs font-semibold text-navy-700 underline" href={`/sources/scopus?preview=${h.id}`}>{L ? "buka pratinjau" : "open preview"}</Link>}</td></tr>))}
          {history.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>—</td></tr>}</tbody></table></div></Card>
    </>
  );
}

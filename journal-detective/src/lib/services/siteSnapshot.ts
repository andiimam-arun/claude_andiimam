import { prisma } from "../db";
import { safeFetch } from "../security/safeFetch";
import { stripHtml, looksLikeInjection } from "../security/sanitize";
import { inspectPageText } from "./hijack";
import { makeEvidence } from "../engine/evidence";
import { registrableDomain } from "../engine/domain";
import { parseJson } from "../engine/util";
import { audit, type Actor } from "./audit";

/**
 * Tindakan eksplisit peninjau: mengambil beranda situs yang diajukan (aman terhadap SSRF) dan mencatat fakta yang terlihat.
 * Teks halaman = DATA tidak tepercaya; hanya pola regex diekstrak. Hasil berupa bukti 'dilaporkan', bukan kesimpulan.
 */
export async function snapshotSubmittedSite(journalId: string, url: string, actor: Actor): Promise<string> {
  const j = await prisma.journal.findUniqueOrThrow({ where: { id: journalId } });
  const res = await safeFetch(url, { timeoutMs: 8000, maxBytes: 400_000 });
  const issns = [j.issn, j.eissn].filter(Boolean) as string[];
  const page = inspectPageText(res.text, issns);
  const text = stripHtml(res.text).slice(0, 4000);
  const dom = registrableDomain(res.finalUrl);
  const verified = parseJson<string[]>(j.verifiedDomainsJson, []);
  const foreign = !!dom && verified.length > 0 && !verified.includes(dom);
  const injected = looksLikeInjection(text);
  const common = { journalId, origin: "AUTO" as const, integration: "LIVE_VERIFIED", sourceName: "Pengambilan halaman oleh peninjau", sourceUrl: res.finalUrl, retrievedAt: new Date(), strength: "WEAK" };
  const ev = makeEvidence({
    check: "HIJACK", key: "hijack.site_snapshot", finding: `Beranda ${dom} diambil (HTTP ${res.status}); judul halaman: "${page.title ?? "?"}"; ISSN tampil: ${page.issnsOnPage.join(", ") || "tidak ada"}.`,
    status: "REPORTED_UNVERIFIED", integration: "LIVE_VERIFIED", sourceName: common.sourceName, sourceUrl: common.sourceUrl, extracted: text.slice(0, 600),
    explanation: `Pengamatan satu kali, bukan bukti keaslian.${injected ? " Peringatan: halaman memuat teks berpola injeksi instruksi; diabaikan dan diperlakukan sebagai data." : ""}`,
    data: { domain: dom, status: res.status, title: page.title, issnsOnPage: page.issnsOnPage, injectionPatternSeen: injected }, fingerprintSeed: `snap|${dom}|${new Date().toISOString().slice(0, 10)}`,
  });
  await prisma.evidence.create({
    data: { journalId, origin: "MANUAL", check: ev.check, key: ev.key, finding: ev.finding, status: ev.status, integration: ev.integration, sourceName: ev.sourceName, sourceUrl: ev.sourceUrl, retrievedAt: new Date(),
      extracted: ev.extracted, explanation: ev.explanation, severity: "INFO", strength: ev.strength, requiresHuman: false, dataJson: JSON.stringify(ev.data), fingerprint: ev.fingerprint, createdById: actor.id },
  });
  let note = "Halaman diambil dan dicatat sebagai bukti pengamatan.";
  if (page.mentionsJournalIssn && foreign) {
    const flag = makeEvidence({
      check: "HIJACK", key: "hijack.issn_reuse", finding: `Halaman di ${dom} menampilkan ISSN jurnal ini, padahal domain tersebut bukan domain resmi terverifikasi (${verified.join(", ")}).`,
      status: "REPORTED_UNVERIFIED", integration: "LIVE_VERIFIED", sourceName: common.sourceName, sourceUrl: res.finalUrl, severity: "HIGH", strength: "MODERATE", requiresHumanConfirmation: true,
      explanation: "Pemakaian ISSN pada domain tak dikenal adalah indikator kuat peniruan, namun perlu konfirmasi manusia (mungkin pengindeks/agregator sah).", data: { domain: dom, officialDomains: verified }, fingerprintSeed: `issn-reuse|${dom}`,
    });
    await prisma.evidence.create({
      data: { journalId, origin: "MANUAL", check: flag.check, key: flag.key, finding: flag.finding, status: flag.status, integration: flag.integration, sourceName: flag.sourceName, sourceUrl: flag.sourceUrl, retrievedAt: new Date(),
        explanation: flag.explanation, severity: flag.severity, strength: flag.strength, requiresHuman: true, dataJson: JSON.stringify(flag.data), fingerprint: flag.fingerprint, createdById: actor.id },
    });
    note += " ISSN jurnal tampil di domain non-resmi: tanda 'penggunaan ISSN' dibuat untuk ditinjau.";
  }
  await audit(actor, "SITE_SNAPSHOT", "Journal", journalId, { url: res.finalUrl, status: res.status });
  return note;
}

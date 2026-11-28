"use server";
import { requireRole } from "@/lib/auth/session";
import { runInvestigation, addManualEvidence, reviewEvidence, retractEvidence, flagForReassessment, MANUAL_KINDS, type ManualKind } from "@/lib/services/investigation";
import { getAiProvider } from "@/lib/services/ai";
import { loadAssessment } from "@/lib/services/investigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { reasonText, actionText } from "@/lib/i18n";
import { go, str, optStr, errMsg } from "./util";
import { snapshotSubmittedSite } from "@/lib/services/siteSnapshot";
import { recordFinding, retractFinding, type FindingStatus } from "@/lib/services/destinationFindings";

const list = (s: string) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

export async function startInvestigationAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD", "ADMIN");
  let target = "/investigations/new";
  try {
    const title = str(form, "title");
    if (title.length < 3) throw new Error("Judul jurnal wajib diisi (minimal 3 karakter)");
    const url = optStr(form, "submittedWebsite");
    if (url && !/^https?:\/\//i.test(url)) throw new Error("URL situs harus diawali http:// atau https://");
    const res = await runInvestigation({
      actor: user,
      identity: {
        title, altTitles: list(str(form, "altTitles")), issn: optStr(form, "issn"), eissn: optStr(form, "eissn"), scopusSourceId: optStr(form, "scopusSourceId"),
        publisher: optStr(form, "publisher"), country: optStr(form, "country"), submittedWebsite: url, subjects: list(str(form, "subjects")),
        claimedIndexing: list(str(form, "claimedIndexing")), claimedQuartile: optStr(form, "claimedQuartile"),
      },
    });
    target = `/investigations/${res.assessmentId}`;
  } catch (e) {
    go("/investigations/new", { error: errMsg(e) });
  }
  go(target, { notice: "Penilaian selesai." });
}

export async function reassessJournalAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const a = await prisma.assessment.findUniqueOrThrow({ where: { id: str(form, "assessmentId") } });
  const input = JSON.parse(a.inputJson);
  let id = a.id;
  try {
    const res = await runInvestigation({ actor: user, identity: { ...input, submittedWebsite: a.submittedUrl } });
    id = res.assessmentId;
  } catch (e) {
    go(`/investigations/${a.id}`, { error: errMsg(e) });
  }
  go(`/investigations/${id}`, { notice: "Penilaian ulang selesai (bukti waktu-sensitif divalidasi ulang)." });
}

export async function addEvidenceAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const back = str(form, "back") || "/journals";
  try {
    const kind = str(form, "kind") as ManualKind;
    if (!MANUAL_KINDS.includes(kind)) throw new Error("Jenis bukti tidak valid");
    const data: Record<string, any> = {};
    switch (kind) {
      case "scopus.coverage": {
        const cov = str(form, "coverage");
        data.coverage = cov === "NOT_LISTED" ? undefined : cov;
        data.coverageTo = optStr(form, "coverageTo");
        data.conclusive = cov === "NOT_LISTED";
        break;
      }
      case "scimago.entry": data.found = true; data.quartile = str(form, "quartile"); data.year = Number(str(form, "year")) || undefined; data.sjr = optStr(form, "sjr"); break;
      case "national.accreditation": data.accredited = str(form, "accredited") === "yes"; data.level = str(form, "level"); break;
      case "identity.official_domain": data.includeSubdomains = form.get("includeSubdomains") === "on"; data.domains = list(str(form, "domains")); if (!data.domains.length) throw new Error("Isi minimal satu domain/URL resmi"); break;
      case "hijack.website": data.relation = str(form, "relation"); data.submittedDomain = str(form, "submittedDomain"); if (!data.submittedDomain) throw new Error("Domain yang diajukan wajib diisi"); break;
      case "predatory.indicator": data.indicator = str(form, "indicator"); break;
      case "beall.match": data.year = Number(str(form, "year")) || undefined; data.listName = "Beall (historis)"; break;
      default: break;
    }
    const status = str(form, "status") as any;
    const severity = (str(form, "severity") || (kind === "hijack.website" && data.relation === "CONFIRMED_CLONE" ? "CRITICAL" : "INFO")) as any;
    await addManualEvidence({
      journalId: str(form, "journalId"), kind, finding: str(form, "finding"), status, sourceName: str(form, "sourceName"), sourceUrl: optStr(form, "sourceUrl") ?? undefined,
      sourceRef: optStr(form, "sourceRef") ?? undefined, sourceDataDate: optStr(form, "sourceDataDate") ?? undefined, extracted: optStr(form, "extracted") ?? undefined,
      explanation: optStr(form, "explanation") ?? undefined, severity, data, actor: user,
    });
  } catch (e) {
    go(back, { error: errMsg(e) });
  }
  go(back, { notice: "Bukti manual dicatat. Jalankan penilaian ulang untuk memperbarui keputusan." });
}

export async function reviewEvidenceAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const back = str(form, "back") || "/";
  try {
    await reviewEvidence({ journalId: str(form, "journalId"), fingerprint: str(form, "fingerprint"), decision: str(form, "decision") as any, note: str(form, "note"), actor: user });
  } catch (e) {
    go(back, { error: errMsg(e) });
  }
  go(back, { notice: "Keputusan tinjauan dicatat. Jalankan penilaian ulang untuk memperbarui keputusan." });
}

export async function retractEvidenceAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const back = str(form, "back") || "/";
  try { await retractEvidence(str(form, "id"), user, str(form, "reason") || "ditarik"); } catch (e) { go(back, { error: errMsg(e) }); }
  go(back, { notice: "Bukti manual ditarik." });
}

export async function flagReassessAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const back = str(form, "back") || "/journals";
  try { await flagForReassessment(str(form, "journalId"), user, str(form, "reason") || "ditandai peninjau"); } catch (e) { go(back, { error: errMsg(e) }); }
  go(back, { notice: "Jurnal ditandai untuk penilaian ulang berkala." });
}

export async function snapshotSiteAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const back = str(form, "back") || "/";
  try {
    const msg = await snapshotSubmittedSite(str(form, "journalId"), str(form, "url"), user);
    go(back, { notice: msg });
  } catch (e) {
    go(back, { error: errMsg(e) });
  }
}

export async function aiSummaryAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "assessmentId");
  const back = `/investigations/${id}`;
  const ai = getAiProvider();
  if (!ai.enabled) go(back, { error: "Ringkasan AI nonaktif: layanan AI eksternal nonaktif (butuh ANTHROPIC_API_KEY + AI_EXTERNAL_ENABLED=1 + AI_DATA_HANDLING_ACK oleh operator). Seluruh keputusan tetap berbasis aturan." });
  try {
    const a = await loadAssessment(id);
    if (!a) go(back, { error: "Penilaian tidak ditemukan" });
    const facts = [
      `Jurnal: ${a!.journal.title}`, `Status (aturan): ${a!.decision.journalStatus}`,
      ...a!.decision.reasons.map((r) => `- ${reasonText("id", r)}`), ...a!.decision.nextActions.map((x) => `* ${actionText("id", x)}`),
    ].join("\n");
    const summary = await ai.summarize({ system: "Ringkas temuan penilaian jurnal dalam bahasa Indonesia untuk pejabat unit publikasi dalam maksimal 8 kalimat dan sarankan pemeriksaan lanjutan. Jangan menambah fakta.", facts });
    await prisma.assessment.update({ where: { id }, data: { aiSummary: summary } });
    await audit(user, "AI_SUMMARY_GENERATED", "Assessment", id, { provider: ai.name });
  } catch (e) {
    go(back, { error: errMsg(e) });
  }
  go(back, { notice: "Ringkasan AI (penasihat) dibuat." });
}

export async function recordFindingAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const back = str(form, "back") || "/journals";
  try {
    await recordFinding({
      journalId: str(form, "journalId"), urlOrHost: str(form, "host"), status: str(form, "status") as FindingStatus, basis: str(form, "basis"), sourceName: str(form, "sourceName"),
      sourceUrl: optStr(form, "sourceUrl"), sourceRef: optStr(form, "sourceRef"), sourceDataDate: optStr(form, "sourceDataDate"), includeSubdomains: form.get("includeSubdomains") === "on", actor: user,
    });
  } catch (e) { go(back, { error: errMsg(e) }); }
  go(back, { notice: "Temuan tujuan dicatat (permanen per host). Jalankan penilaian ulang." });
}

export async function retractFindingAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const back = str(form, "back") || "/journals";
  try { await retractFinding({ findingId: str(form, "findingId"), rationale: str(form, "rationale"), sourceUrl: optStr(form, "sourceUrl"), sourceRef: optStr(form, "sourceRef"), actor: user }); } catch (e) { go(back, { error: errMsg(e) }); }
  go(back, { notice: "Temuan dikoreksi. Riwayat temuan asli dipertahankan. Jalankan penilaian ulang." });
}

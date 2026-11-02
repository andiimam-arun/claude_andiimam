"use server";
import { prisma } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/auth/session";
import { applicationSchema, createApplication, setChecklist, updateStage, addEvent, resolveFlag, refreshFlags } from "@/lib/services/applications";
import { uploadDocument, saveDocumentFields, purgeApplicationDocuments } from "@/lib/services/documents";
import { performReviewAction, ActionError } from "@/lib/services/approval";
import { STAGES, DOC_TYPES, type DocType, type Stage } from "@/lib/engine/types";
import type { ReviewActionType } from "@/lib/engine/approval";
import { go, str, errMsg } from "./util";

export async function createApplicationAction(form: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(["studentName", "studentNumber", "studyProgram", "supervisor", "studentEmail", "manuscriptTitle", "researchField", "stage", "submissionDate", "trackingId", "journalUrl", "articleDoi", "articleUrl", "journalName", "journalIssn", "journalPublisher", "claimedIndexing", "claimedQuartile"].map((k) => [k, str(form, k) || undefined]));
  let id = "";
  try {
    const parsed = applicationSchema.parse(raw);
    if (parsed.stage !== "PRE_SUBMISSION" && !parsed.submissionDate) throw new Error("Tanggal pengiriman wajib diisi untuk tahap setelah pra-pengiriman");
    const app = await createApplication(parsed, user, user.role === "STUDENT" ? user.id : null);
    id = app.id;
    // unggahan awal (opsional)
    const f = form.get("file");
    if (f instanceof File && f.size > 0) {
      await uploadDocument({ applicationId: app.id, docType: (str(form, "docType") || "OTHER") as DocType, filename: f.name, data: Buffer.from(await f.arrayBuffer()), actor: user });
    }
  } catch (e) {
    go("/applications/new", { error: errMsg(e) });
  }
  go(`/applications/${id}`, { notice: "Permohonan dibuat dan jurnal dinilai otomatis." });
}

async function assertAccess(applicationId: string, user: { id: string; role: string }) {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (user.role === "STUDENT" && app.studentUserId !== user.id) throw new Error("Tidak berwenang atas permohonan ini");
  return app;
}

export async function uploadDocumentAction(form: FormData) {
  const user = await requireUser();
  const id = str(form, "applicationId");
  try {
    await assertAccess(id, user);
    const f = form.get("file");
    if (!(f instanceof File) || f.size === 0) throw new Error("Pilih berkas untuk diunggah");
    if (!DOC_TYPES.includes(str(form, "docType") as DocType)) throw new Error("Jenis dokumen tidak valid");
    await uploadDocument({ applicationId: id, docType: str(form, "docType") as DocType, filename: f.name, data: Buffer.from(await f.arrayBuffer()), actor: user });
  } catch (e) {
    go(`/applications/${id}`, { error: errMsg(e) });
  }
  go(`/applications/${id}#dokumen`, { notice: "Dokumen diunggah." });
}

export async function updateStageAction(form: FormData) {
  const user = await requireUser();
  const id = str(form, "applicationId");
  try {
    await assertAccess(id, user);
    const stage = str(form, "stage") as Stage;
    if (!STAGES.includes(stage)) throw new Error("Tahap tidak valid");
    await updateStage(id, stage, user);
  } catch (e) { go(`/applications/${id}`, { error: errMsg(e) }); }
  go(`/applications/${id}`, { notice: "Tahap diperbarui; daftar bukti disesuaikan." });
}

export async function addEventAction(form: FormData) {
  const user = await requireUser();
  const id = str(form, "applicationId");
  try {
    await assertAccess(id, user);
    if (!str(form, "occurredAt")) throw new Error("Tanggal wajib diisi");
    await addEvent(id, { type: str(form, "type"), occurredAt: str(form, "occurredAt"), note: str(form, "note") }, user);
  } catch (e) { go(`/applications/${id}`, { error: errMsg(e) }); }
  go(`/applications/${id}#linimasa`, { notice: "Peristiwa ditambahkan." });
}

export async function setChecklistAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "applicationId");
  try { await setChecklist(id, str(form, "docType") as DocType, str(form, "status") as any, str(form, "note") || null, user); } catch (e) { go(`/applications/${id}`, { error: errMsg(e) }); }
  go(`/applications/${id}#daftar-bukti`, { notice: "Daftar periksa diperbarui." });
}

export async function saveFieldsAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "applicationId");
  const list = (k: string) => str(form, k).split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  try {
    await saveDocumentFields(str(form, "documentId"), {
      manuscriptId: str(form, "manuscriptId") || undefined, title: str(form, "title") || undefined, journalName: str(form, "journalName") || undefined,
      issns: list("issns"), dois: list("dois"), emails: list("emails").map((e) => e.toLowerCase()), domains: list("domains"), dates: list("dates"), amounts: list("amounts"),
    }, user);
  } catch (e) { go(`/applications/${id}`, { error: errMsg(e) }); }
  go(`/applications/${id}#dokumen`, { notice: "Hasil ekstraksi dikoreksi dan ditandai telah ditinjau." });
}

export async function resolveFlagAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "applicationId");
  try { await resolveFlag(str(form, "flagId"), str(form, "state") as any, str(form, "note"), user); await refreshFlags(id); } catch (e) { go(`/applications/${id}`, { error: errMsg(e) }); }
  go(`/applications/${id}#tanda`, { notice: "Tanda peninjauan diperbarui." });
}

export async function reviewActionAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "applicationId");
  try {
    await performReviewAction({ applicationId: id, actor: user, action: str(form, "action") as ReviewActionType, rationale: str(form, "rationale") });
  } catch (e) {
    go(`/applications/${id}#tindakan`, { error: e instanceof ActionError ? e.message : errMsg(e) });
  }
  go(`/applications/${id}#tindakan`, { notice: "Tindakan peninjauan dicatat." });
}

export async function purgeDocsAction(form: FormData) {
  const user = await requireRole("ADMIN", "HEAD");
  const id = str(form, "applicationId");
  try { await purgeApplicationDocuments(id, user, str(form, "reason") || "retensi"); } catch (e) { go(`/applications/${id}`, { error: errMsg(e) }); }
  go(`/applications/${id}`, { notice: "Berkas dokumen dihapus permanen (jejak audit dipertahankan)." });
}

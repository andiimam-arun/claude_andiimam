"use server";
import { requireRole } from "@/lib/auth/session";
import { createCase, updateCaseDetails, createCoverageShells, recordReference, runCase, classifyRun, resolveCase, type CaseInput, type ReferenceInput } from "@/lib/services/validation";
import { isPilot } from "@/lib/mode";
import { go, str, optStr, errMsg } from "./util";

/** Sumber: satu per baris — "label | url atau referensi dokumen | tgl data sumber (YYYY-MM-DD) | tgl diambil (YYYY-MM-DD)" */
function parseSources(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [label, where, dd, rt] = l.split("|").map((x) => x.trim());
    const isUrl = /^https?:\/\//i.test(where ?? "");
    return { label: label ?? "", url: isUrl ? where : "", ref: isUrl ? undefined : where || undefined, sourceDataDate: dd || undefined, retrievedAt: rt || undefined };
  });
}

function caseFrom(form: FormData): CaseInput {
  return {
    category: str(form, "category"), title: str(form, "title"), issn: optStr(form, "issn"), eissn: optStr(form, "eissn"), submittedUrl: optStr(form, "submittedUrl"), authenticUrl: optStr(form, "authenticUrl"),
    stage: str(form, "stage") || "PRE_SUBMISSION", pseudonym: optStr(form, "pseudonym"), notes: optStr(form, "notes"), applicationId: optStr(form, "applicationId"),
    isFictionalFixture: !isPilot() && form.get("isFictionalFixture") === "on", sources: parseSources(str(form, "sources")),
  } as CaseInput;
}

export async function createCaseAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  let id = "";
  try { id = (await createCase(caseFrom(form), user)).id; } catch (e) { go("/validation/new", { error: errMsg(e) }); }
  go(`/validation/${id}`, { notice: "Kasus validasi dibuat. Langkah berikut: catat penilaian referensi manual SEBELUM menjalankan aplikasi." });
}
export async function updateCaseAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "caseId");
  try { await updateCaseDetails(id, caseFrom(form), user); } catch (e) { go(`/validation/${id}`, { error: errMsg(e) }); }
  go(`/validation/${id}`, { notice: "Detail kasus disimpan." });
}
export async function createShellsAction() {
  const user = await requireRole("REVIEWER", "HEAD");
  let n = 0;
  try { n = await createCoverageShells(user); } catch (e) { go("/validation", { error: errMsg(e) }); }
  go("/validation", { notice: `${n} kerangka kasus dibuat (status: MENUNGGU REFERENSI MANUAL). Isi dengan kasus nyata; tidak ada hasil yang dikarang.` });
}
export async function recordReferenceAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "caseId");
  try {
    const input: ReferenceInput = {
      journalStatus: str(form, "journalStatus") as any, destinationStatus: str(form, "destinationStatus") as any, adminStatus: str(form, "adminStatus") as any, finalStatus: str(form, "finalStatus") as any,
      rationale: str(form, "rationale"), uncertainty: optStr(form, "uncertainty"), assessedAt: str(form, "assessedAt"), sources: parseSources(str(form, "sources")),
    };
    await recordReference(id, input, user);
  } catch (e) { go(`/validation/${id}`, { error: errMsg(e) }); }
  go(`/validation/${id}`, { notice: "Referensi manual dicatat dan dikunci. Aplikasi kini dapat dijalankan." });
}
export async function runCaseAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "caseId");
  try { await runCase(id, user, { retestOfRunId: optStr(form, "retestOf") ?? undefined }); } catch (e) { go(`/validation/${id}`, { error: errMsg(e) }); }
  go(`/validation/${id}#hasil`, { notice: "Proses selesai; snapshot bukti/kebijakan/versi tersimpan." });
}
export async function classifyRunAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "caseId");
  try { await classifyRun(str(form, "runId"), { discrepancyClass: str(form, "discrepancyClass"), note: str(form, "note"), correctiveAction: str(form, "correctiveAction") }, user); } catch (e) { go(`/validation/${id}`, { error: errMsg(e) }); }
  go(`/validation/${id}#hasil`, { notice: "Klasifikasi perbedaan dicatat." });
}
export async function resolveCaseAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD");
  const id = str(form, "caseId");
  try { await resolveCase(id, user); } catch (e) { go(`/validation/${id}`, { error: errMsg(e) }); }
  go(`/validation/${id}`, { notice: "Kasus ditandai selesai." });
}

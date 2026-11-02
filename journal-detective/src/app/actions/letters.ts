"use server";
import { requireUser, requireRole } from "@/lib/auth/session";
import { createOrRefreshDraft, issueLetter, revokeLetter, IssueError, type LetterType } from "@/lib/services/letters";
import { go, str, errMsg } from "./util";

export async function createDraftAction(form: FormData) {
  const user = await requireRole("REVIEWER", "HEAD", "ADMIN");
  const appId = str(form, "applicationId");
  let id = "";
  try { id = await createOrRefreshDraft(appId, str(form, "type") as LetterType, user); } catch (e) { go(`/applications/${appId}`, { error: errMsg(e) }); }
  go(`/letters/${id}`, { notice: "Draf surat dibuat/diperbarui (berwatermark DRAF)." });
}

export async function issueLetterAction(form: FormData) {
  const user = await requireUser();
  const id = str(form, "letterId");
  try { await issueLetter(id, user, str(form, "officialNumber")); } catch (e) { go(`/letters/${id}`, { error: e instanceof IssueError ? e.message : errMsg(e) }); }
  go(`/letters/${id}`, { notice: "Surat resmi diterbitkan." });
}

export async function revokeLetterAction(form: FormData) {
  const user = await requireUser();
  const id = str(form, "letterId");
  try { await revokeLetter(id, user, str(form, "reason")); } catch (e) { go(`/letters/${id}`, { error: errMsg(e) }); }
  go(`/letters/${id}`, { notice: "Surat dicabut." });
}

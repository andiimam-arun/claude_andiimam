import { prisma } from "../db";
import { parseJson } from "../engine/util";
import type { JournalDecision } from "../engine/types";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function dashboardStats() {
  const [journals, assessments, apps, letters, actions, audits, flagged] = await Promise.all([
    prisma.journal.findMany({ include: { assessments: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.assessment.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.application.findMany({ include: { journal: true } }),
    prisma.letter.findMany(),
    prisma.reviewAction.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.journal.count({ where: { reassessFlag: true } }),
  ]);
  const latest = journals.map((j) => j.assessments[0]).filter(Boolean);
  const count = (s: string) => latest.filter((a) => a.journalStatus === s).length;
  const idxDist = new Map<string, number>();
  let clones = 0;
  for (const a of latest) {
    const d = parseJson<JournalDecision | null>(a.decisionJson, null);
    if (!d) continue;
    idxDist.set(d.indexingStatus, (idxDist.get(d.indexingStatus) ?? 0) + 1);
    if (d.websiteStatus === "UNSAFE_CONFIRMED_CLONE") clones++;
  }
  const months: Record<string, number> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) months[monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))] = 0;
  for (const a of apps) { const k = monthKey(a.createdAt); if (k in months) months[k]++; }
  const top = new Map<string, { title: string; n: number }>();
  for (const a of apps) if (a.journal) { const e = top.get(a.journal.id) ?? { title: a.journal.title, n: 0 }; e.n++; top.set(a.journal.id, e); }
  for (const a of assessments) { const j = journals.find((x) => x.id === a.journalId); if (j && !apps.some((p) => p.journalId === j.id)) { const e = top.get(j.id) ?? { title: j.title, n: 0 }; e.n++; top.set(j.id, e); } }
  const decided = apps.filter((a) => a.decidedAt);
  const turnaroundDays = decided.length ? decided.reduce((s, a) => s + (a.decidedAt!.getTime() - a.createdAt.getTime()) / 86_400_000, 0) / decided.length : null;
  const overdue = apps.filter((a) => !["APPROVED", "REJECTED"].includes(a.workflow));
  return {
    totalJournals: journals.length, green: count("GREEN"), yellow: count("YELLOW"), red: count("RED"),
    awaitingEvidence: apps.filter((a) => a.workflow === "NEEDS_EVIDENCE").length,
    awaitingApproval: apps.filter((a) => ["RECOMMENDED", "ESCALATED", "IN_REVIEW", "PENDING_REVIEW"].includes(a.workflow)).length,
    cloneIncidents: clones, lettersIssued: letters.filter((l) => l.status === "ISSUED").length,
    totalApplications: apps.length, openApplications: overdue.length, flaggedReassess: flagged,
    monthly: Object.entries(months).map(([month, n]) => ({ month, n })),
    topJournals: [...top.values()].sort((a, b) => b.n - a.n).slice(0, 6),
    indexingDist: [...idxDist.entries()].map(([k, n]) => ({ k, n })),
    turnaroundDays, recentActions: actions, recentAudit: audits,
  };
}

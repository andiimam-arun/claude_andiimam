import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";
import { loadAssessment } from "@/lib/services/investigation";
import { renderAssessmentReport } from "@/lib/services/pdf";
import { getPolicyById } from "@/lib/services/policyService";
import { audit } from "@/lib/services/audit";
import { parseLang } from "@/lib/i18n";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !isStaff(s.role)) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const data = await loadAssessment(id);
  if (!data) return new NextResponse("Not found", { status: 404 });
  const policy = await getPolicyById(data.assessment.policyId).catch(() => null);
  const lang = parseLang(new URL(req.url).searchParams.get("lang") ?? req.headers.get("cookie")?.match(/jd_lang=(\w+)/)?.[1]);
  const bytes = await renderAssessmentReport({
    lang, journalTitle: data.journal.title, refNumber: data.assessment.refNumber, createdAt: data.assessment.createdAt, policyVersion: data.assessment.policyVersion, policyIsDemo: policy?.isDemo ?? true,
    identity: { issn: data.journal.issn, eissn: data.journal.eissn, publisher: data.journal.publisher, submittedWebsite: data.assessment.submittedUrl }, decision: data.decision, evidence: data.evidence,
  });
  await audit(s, "REPORT_DOWNLOADED", "Assessment", id);
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${data.assessment.refNumber}.pdf"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { renderLetterPdf } from "@/lib/services/pdf";
import { parseJson } from "@/lib/engine/util";
import type { LetterSnapshot } from "@/lib/services/letters";
import { audit } from "@/lib/services/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const l = await prisma.letter.findUnique({ where: { id }, include: { application: true } });
  if (!l) return new NextResponse("Not found", { status: 404 });
  if (s.role === "STUDENT" && (l.application.studentUserId !== s.id || l.status === "DRAFT")) return new NextResponse("Forbidden", { status: 403 });
  const snapshot = parseJson<LetterSnapshot>(l.snapshotJson, null as any);
  const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  const bytes = await renderLetterPdf({
    snapshot, status: l.status as any, officialNumber: l.officialNumber, approverName: l.approverName, approverTitle: l.approverTitle, approvedAt: l.approvedAt,
    verifyUrl: l.status === "ISSUED" ? `${base}/verify/${l.verifyToken}` : null,
  });
  await audit(s, "LETTER_PDF_EXPORTED", "Letter", id, { status: l.status });
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${l.status === "DRAFT" ? "DRAF-" : ""}surat-${l.id.slice(-6)}.pdf"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

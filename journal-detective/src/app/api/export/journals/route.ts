import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isStaff } from "@/lib/auth/permissions";

const esc = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

export async function GET() {
  const s = await getSession();
  if (!s || !isStaff(s.role)) return new NextResponse("Forbidden", { status: 403 });
  const js = await prisma.journal.findMany({ include: { assessments: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { title: "asc" } });
  const rows = [["title", "issn", "eissn", "publisher", "latest_status", "last_verified_at", "record_version"], ...js.map((j) => [j.title, j.issn, j.eissn, j.publisher, j.assessments[0]?.journalStatus, j.lastVerifiedAt?.toISOString(), j.recordVersion])];
  return new NextResponse(rows.map((r) => r.map(esc).join(",")).join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="journal-registry.csv"', "x-content-type-options": "nosniff" } });
}

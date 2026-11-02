import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readDocumentBytes } from "@/lib/services/documents";
import { audit } from "@/lib/services/audit";

/** Akses dokumen terlindungi: hanya staf berwenang atau mahasiswa pemilik permohonan. Selalu diunduh sebagai attachment, tidak pernah dirender inline. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const r = await readDocumentBytes(id);
  if (!r) return new NextResponse("Not found", { status: 404 });
  if (s.role === "ADMIN") return new NextResponse("Forbidden", { status: 403 }); // administrator tidak perlu membaca dokumen mahasiswa
  if (s.role === "STUDENT" && r.doc.application.studentUserId !== s.id) return new NextResponse("Forbidden", { status: 403 });
  await audit(s, "DOCUMENT_ACCESSED", "Document", id, { applicationId: r.doc.applicationId });
  return new NextResponse(new Uint8Array(r.bytes), {
    headers: {
      "content-type": r.doc.mime, "content-disposition": `attachment; filename="${r.doc.filename.replace(/"/g, "")}"`, "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'", "cache-control": "private, no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { exportCsv, ValidationError } from "@/lib/services/validation";

/** Ekspor CSV validasi. Hanya peninjau/Kepala; default tanpa narasi; narasi hanya Kepala (?narrative=1). Tidak di-cache; diaudit. */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || !["REVIEWER", "HEAD"].includes(s.role)) return new NextResponse("Forbidden", { status: 403 });
  const narrative = new URL(req.url).searchParams.get("narrative") === "1";
  try {
    const csv = await exportCsv(s, narrative);
    return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="validasi-${new Date().toISOString().slice(0, 10)}${narrative ? "-narasi" : ""}.csv"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 403 });
    throw e;
  }
}

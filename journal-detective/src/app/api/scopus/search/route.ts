import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { searchScopus } from "@/lib/services/scopusReference";

export const dynamic = "force-dynamic";

/** Autocomplete nama jurnal / ISSN (dengan atau tanpa tanda hubung) / Source ID pada database referensi Scopus terkini. */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  const r = await searchScopus(q, 10);
  return NextResponse.json({
    import: r.import ? { versionLabel: r.import.versionLabel, observationDate: r.import.observationDate.toISOString().slice(0, 10), isDemo: r.import.isDemo } : null,
    kind: r.kind,
    results: r.results,
  }, { headers: { "cache-control": "no-store" } });
}

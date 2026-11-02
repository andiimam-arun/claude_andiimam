/*
 * Smoke test sumber eksternal — JALANKAN OLEH OPERATOR pada server target (dengan akses internet).
 * Memanggil DOAJ & Crossref sungguhan dengan ISSN uji yang dikenal, mencetak hasil mentah (status HTTP, ringkasan), dan menyimpan
 * hasil ke tabel Setting (kunci smoke:<sumber>) agar halaman Sumber Rujukan menampilkan "terakhir diuji hidup".
 * LIVE_VERIFIED hanya dicatat bila permintaan nyata BERHASIL dan isinya cocok dengan harapan. Tidak ada hasil pengganti/demonstrasi.
 * Tidak melewati kontrol akses; satu permintaan per sumber (patuh batas laju).
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { safeFetch } from "../src/lib/security/safeFetch";
import { lookupCrossref, lookupDoaj, httpFailure } from "../src/lib/services/externalSources";

interface Result { source: string; url: string; outcome: "LIVE_OK" | "EMPTY" | "FAILED"; httpStatus?: number; detail: string; at: string; sample?: unknown }

async function raw(url: string): Promise<Result["httpStatus"] | string> {
  try { const r = await safeFetch(url, { timeoutMs: 15000, maxBytes: 300_000 }); return r.status; } catch (e: any) { return `${e?.name ?? "Error"}: ${String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? e).slice(0, 140)}`; }
}

async function main() {
  const out: Result[] = [];
  const now = new Date().toISOString();
  // DOAJ: PLOS ONE (ISSN 1932-6203) — jurnal akses terbuka yang dikenal terdaftar. Crossref: Nature (0028-0836).
  const checks: Array<{ source: string; url: string; run: () => Promise<{ ok: boolean; empty: boolean; detail: string; sample?: unknown }> }> = [
    { source: "DOAJ", url: "https://doaj.org/api/search/journals/issn:1932-6203", run: async () => {
      const r = await lookupDoaj("1932-6203", false); const e = r.evidence[0];
      return { ok: e?.integration === "LIVE_VERIFIED" && e.status === "VERIFIED", empty: e?.status === "NOT_FOUND", detail: `${e?.status}/${e?.integration}: ${e?.finding}`, sample: r.info };
    } },
    { source: "Crossref", url: "https://api.crossref.org/journals/0028-0836", run: async () => {
      const r = await lookupCrossref("0028-0836", "Nature"); const e = r.evidence[0];
      return { ok: e?.integration === "LIVE_VERIFIED" && e.status === "VERIFIED", empty: e?.status === "NOT_FOUND", detail: `${e?.status}/${e?.integration}: ${e?.finding}`, sample: r.info };
    } },
  ];
  for (const c of checks) {
    const st = await raw(c.url);
    const r = await c.run();
    const res: Result = { source: c.source, url: c.url, outcome: r.ok ? "LIVE_OK" : r.empty ? "EMPTY" : "FAILED", httpStatus: typeof st === "number" ? st : undefined, detail: typeof st === "number" ? `${r.detail} (HTTP ${st}${st >= 400 ? ": " + httpFailure(st) : ""})` : `${r.detail} (${st})`, at: now, sample: r.ok ? r.sample : undefined };
    out.push(res);
    console.log(`${res.outcome.padEnd(8)} ${c.source}: ${res.detail}`);
    await prisma.setting.upsert({ where: { key: `smoke:${c.source}` }, create: { key: `smoke:${c.source}`, valueJson: JSON.stringify(res) }, update: { valueJson: JSON.stringify(res) } });
  }
  if (process.env.SCOPUS_API_KEY) console.log("INFO     Scopus API: kunci terdeteksi, tetapi smoke test Scopus API belum diimplementasikan (butuh entitlement). Status tetap 'belum teruji'.");
  else console.log("INFO     Scopus API: tidak ada SCOPUS_API_KEY; pilot memakai impor Source List (tidak butuh kunci).");
  const file = `smoke-report-${now.slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({ generatedAt: now, results: out }, null, 2));
  console.log(`Laporan ditulis ke ${file}. Periksa isi sebelum menyatakan integrasi LIVE.`);
  if (out.some((o) => o.outcome === "FAILED")) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());

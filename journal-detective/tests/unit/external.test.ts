import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safeFetch", () => ({ safeFetch: vi.fn() }));
import { safeFetch } from "@/lib/security/safeFetch";
import { lookupCrossref, lookupDoaj } from "@/lib/services/externalSources";

const mocked = vi.mocked(safeFetch);
const ok = (obj: unknown, status = 200) => ({ ok: status < 400, status, finalUrl: "x", contentType: "application/json", text: typeof obj === "string" ? obj : JSON.stringify(obj), truncated: false, retryAfter: null });

describe("adapter DOAJ & Crossref (fixture terkendali — BUKAN verifikasi hidup)", () => {
  beforeEach(() => { process.env.DISABLE_EXTERNAL_LOOKUPS = ""; mocked.mockReset(); });
  afterEach(() => { process.env.DISABLE_EXTERNAL_LOOKUPS = "1"; });

  it("DOAJ sukses → VERIFIED/LIVE_VERIFIED dengan sumber, URL, tanggal; beranda menjadi bukti domain resmi", async () => {
    mocked.mockResolvedValue(ok({ results: [{ id: "abc", last_updated: "2026-09-01T00:00:00Z", bibjson: { title: "Jurnal Fiktif", pissn: "9900-0016", publisher: { name: "Penerbit" }, ref: { journal: "https://jurnal-fiktif.example/" } } }] }));
    const r = await lookupDoaj("9900-0016", true);
    expect(r.evidence.map((e) => e.key)).toEqual(["metadata.doaj", "identity.official_domain"]);
    expect(r.evidence[0]).toMatchObject({ status: "VERIFIED", integration: "LIVE_VERIFIED", sourceName: "DOAJ API", sourceDataDate: "2026-09-01T00:00:00Z" });
    expect(r.evidence[0].sourceUrl).toContain("doaj.org");
    expect(r.evidence[1].data.domains).toEqual(["https://jurnal-fiktif.example/"]);
  });
  it("DOAJ hasil KOSONG → NOT_FOUND, bukan indikasi penipuan; tidak ada bukti domain", async () => {
    mocked.mockResolvedValue(ok({ results: [] }));
    const r = await lookupDoaj("9900-0016", false);
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]).toMatchObject({ status: "NOT_FOUND", severity: "INFO" });
    expect(r.evidence[0].explanation).toMatch(/bukan bukti penipuan/i);
  });
  it("DOAJ kosong + klaim DOAJ → keparahan MEDIUM (klaim tak terbukti), tetap bukan MERAH", async () => {
    mocked.mockResolvedValue(ok({ results: [] }));
    expect((await lookupDoaj("9900-0016", true)).evidence[0].severity).toBe("MEDIUM");
  });
  it("timeout → UNAVAILABLE/ERROR 'waktu habis'", async () => {
    mocked.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const e = (await lookupDoaj("9900-0016", false)).evidence[0];
    expect(e).toMatchObject({ status: "UNAVAILABLE", integration: "ERROR" });
    expect(e.finding).toContain("waktu habis");
  });
  it("batas laju 429 dibedakan dan memuat Retry-After", async () => {
    mocked.mockResolvedValue({ ...ok("", 429), retryAfter: "30" });
    const e = (await lookupCrossref("9900-0016", "X")).evidence[0];
    expect(e).toMatchObject({ status: "UNAVAILABLE", integration: "ERROR" });
    expect(e.finding).toMatch(/dibatasi laju.*429.*30/);
  });
  it("galat server 503 & akses ditolak 403 dibedakan", async () => {
    mocked.mockResolvedValue(ok("", 503));
    expect((await lookupDoaj("9900-0016", false)).evidence[0].finding).toContain("galat server");
    mocked.mockResolvedValue(ok("", 403));
    expect((await lookupDoaj("9900-0016", false)).evidence[0].finding).toContain("akses ditolak");
  });
  it("respons rusak / bentuk tak dikenal → ERROR, tidak pernah VERIFIED", async () => {
    mocked.mockResolvedValue(ok("<html>bukan json</html>"));
    expect((await lookupDoaj("9900-0016", false)).evidence[0]).toMatchObject({ status: "UNAVAILABLE", integration: "ERROR" });
    mocked.mockResolvedValue(ok({ lain: 1 }));
    expect((await lookupDoaj("9900-0016", false)).evidence[0].status).toBe("UNAVAILABLE");
    mocked.mockResolvedValue(ok({ message: "bukan objek" }));
    expect((await lookupCrossref("9900-0016", "X")).evidence[0].status).toBe("UNAVAILABLE");
  });
  it("Crossref sukses, 404 (NOT_FOUND), dan ketidakcocokan judul → konflik identitas perlu tinjauan manusia", async () => {
    mocked.mockResolvedValue(ok({ message: { title: "Jurnal Fiktif", publisher: "P", ISSN: ["9900-0016"], counts: { "total-dois": 12 } } }));
    const a = await lookupCrossref("9900-0016", "Jurnal Fiktif");
    expect(a.evidence[0]).toMatchObject({ status: "VERIFIED", integration: "LIVE_VERIFIED" });
    mocked.mockResolvedValue(ok("", 404));
    expect((await lookupCrossref("9900-0016", "X")).evidence[0]).toMatchObject({ status: "NOT_FOUND", severity: "INFO" });
    mocked.mockResolvedValue(ok({ message: { title: "Judul Lain Total", publisher: "P", ISSN: ["9900-0016"] } }));
    const c = await lookupCrossref("9900-0016", "Jurnal Fiktif Nusantara");
    expect(c.evidence.some((e) => e.key === "identity.title_mismatch" && e.requiresHumanConfirmation)).toBe(true);
  });
  it("pencarian dinonaktifkan operator → UNAVAILABLE tanpa memanggil jaringan", async () => {
    process.env.DISABLE_EXTERNAL_LOOKUPS = "1";
    const r = await lookupDoaj("9900-0016", false);
    expect(mocked).not.toHaveBeenCalled();
    expect(r.evidence[0].status).toBe("UNAVAILABLE");
  });
});

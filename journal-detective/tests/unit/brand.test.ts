import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { findLogo, logoForPdf, APP_NAME, FACULTY_EN } from "@/lib/brand";
import { renderLetterPdf } from "@/lib/services/pdf";
import { DEFAULT_BRANDING } from "@/lib/services/settings";

const dir = path.join(process.cwd(), "public", "branding");
const logo = path.join(dir, "logo-unhas.png");
// PNG 1×1 piksel (hanya untuk menguji penyematan; BUKAN logo UNHAS)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
afterAll(() => { if (existsSync(logo)) rmSync(logo); });

describe("merek aplikasi & logo", () => {
  it("nama aplikasi, fakultas, dan kop surat bawaan", () => {
    expect(APP_NAME).toBe("Journal Assessment");
    expect(FACULTY_EN).toBe("Faculty of Public Health");
    expect(DEFAULT_BRANDING.faculty).toContain("Kesehatan Masyarakat");
  });
  it("tanpa berkas logo → tidak ada logo (tidak ada logo tiruan); dengan berkas → tersedia dan tersemat pada PDF", async () => {
    if (existsSync(logo)) rmSync(logo);
    expect(findLogo()).toBeNull();
    expect(logoForPdf()).toBeNull();
    mkdirSync(dir, { recursive: true });
    writeFileSync(logo, PNG);
    expect(findLogo()?.url).toBe("/branding/logo-unhas.png");
    expect(logoForPdf()?.kind).toBe("png");
    const snap: any = { type: "PRE_SUBMISSION", title: "T", opening: "o", approvalStatement: "a", closing: "c", student: { name: "n", number: "1", program: "p", supervisor: "s" }, manuscript: { title: "m", stage: "s", trackingId: null },
      journal: { title: "j", issn: null, eissn: null, publisher: null, verifiedWebsites: [], submittedWebsite: null }, indexingAssessment: "-", conclusions: [], statuses: { journal: "-", destination: "-", administrative: "-", final: "-" },
      assessmentRef: "X", assessmentDate: "2026-11-28", policyVersion: 1, policyIsDemo: true, override: null, branding: DEFAULT_BRANDING };
    const pdf = await renderLetterPdf({ snapshot: snap, status: "DRAFT", officialNumber: null, approverName: null, approverTitle: null, approvedAt: null, verifyUrl: null });
    expect(Buffer.from(pdf).includes(Buffer.from("/Subtype /Image"))).toBe(true);
  });
});

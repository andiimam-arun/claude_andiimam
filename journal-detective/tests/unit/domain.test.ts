import { describe, expect, it } from "vitest";
import { compareHosts, normalizeDestination } from "@/lib/engine/domain";

describe("normalisasi tujuan & perbandingan HOST persis", () => {
  it("huruf besar, www., titik akhir, jalur, port standar → host yang sama", () => {
    for (const u of ["HTTPS://WWW.Jurnal.Example./index.php/x?y=1", "jurnal.example", "http://jurnal.example:80/", "https://jurnal.example:443"]) expect(normalizeDestination(u).host, u).toBe("jurnal.example");
  });
  it("menolak skema berbahaya & URL tidak valid; menandai kredensial, port aneh, IP, punycode", () => {
    for (const u of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x.example", "", "http://", "https://"]) expect(normalizeDestination(u).ok, u).toBe(false);
    expect(normalizeDestination("https://user:pw@jurnal.example/").problems).toContain("CREDENTIALS_IN_URL");
    expect(normalizeDestination("https://jurnal.example:8443/").problems).toContain("NON_STANDARD_PORT");
    expect(normalizeDestination("http://203.0.113.5/").problems).toContain("IP_HOST");
    expect(normalizeDestination("https://xn--80ak6aa92e.example/").problems).toContain("PUNYCODE");
  });
  it("tipuan userinfo: host sebenarnya yang dipakai", () => {
    expect(normalizeDestination("https://jurnal.example@jahat.example/").host).toBe("jahat.example");
  });
  it("perbandingan: persis, subdomain tak terverifikasi, subdomain dicakup, beda domain", () => {
    const off = [{ host: "jurnal.example" }];
    expect(compareHosts("https://www.jurnal.example/x", off)).toBe("EXACT");
    expect(compareHosts("https://submit.jurnal.example", off)).toBe("SAME_REGISTRABLE_OTHER_HOST");
    expect(compareHosts("https://submit.jurnal.example", [{ host: "jurnal.example", includeSubdomains: true }])).toBe("OFFICIAL_SUBDOMAIN");
    expect(compareHosts("https://jahat-jurnal.example", off)).toBe("DIFFERENT");
    expect(compareHosts("https://evil-jurnal.example.jahat.example", [{ host: "jurnal.example", includeSubdomains: true }])).toBe("DIFFERENT");
    expect(compareHosts("", off)).toBe("NO_SUBMITTED");
    expect(compareHosts("https://x.example", [])).toBe("NO_OFFICIAL");
  });
  it("host dengan akhiran mirip tidak dianggap subdomain", () => {
    expect(compareHosts("https://notjurnal.example", [{ host: "jurnal.example", includeSubdomains: true }])).toBe("DIFFERENT");
  });
});

import { describe, expect, it } from "vitest";
import { en, id } from "@/lib/i18n/dict";
import { reasonText, t } from "@/lib/i18n";
import { decideJournal } from "@/lib/engine/decision";
import { decideAdministrative, decideFinal } from "@/lib/engine/clearance";
import { ev, greenSet, identity, NOW, policy } from "./fixtures";

describe("i18n", () => {
  it("kamus Indonesia dan Inggris memiliki kunci yang sama", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
  });
  it("interpolasi parameter", () => {
    expect(t("id", "reason.quartile_ok", { q: "Q1", year: 2025 })).toContain("Q1");
  });
  it("setiap kode alasan/tindakan yang dapat dihasilkan mesin memiliki teks", () => {
    const sets = [
      greenSet(), [], [ev.identityOk(), ev.scopus("DISCONTINUED"), ev.siteMatches()], [...greenSet(), ev.beall()], [ev.identityOk(), ev.siteClone(), ev.scopus("ACTIVE")],
      [ev.identityOk(), ev.scopusNotFound("LIVE_VERIFIED", true), ev.siteMatches()],
    ];
    for (const s of sets) {
      const d = decideJournal({ identity: identity(), evidence: s, policy: policy({ requiredQuartiles: ["Q1"] }), now: NOW });
      for (const r of d.reasons) expect(reasonText("id", r), r.code).not.toBe(r.code);
      for (const a of d.nextActions) expect(id[`action.${a.code}`], a.code).toBeTruthy();
      const f = decideFinal(d, decideAdministrative({ stage: "ACCEPTED", checklist: [], flags: [], adminRejected: true }, policy()), policy());
      for (const r of f.reasons) expect(reasonText("id", r), r.code).not.toBe(r.code);
    }
  });
});

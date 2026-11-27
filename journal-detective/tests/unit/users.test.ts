import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createUsers, generatePassword, planUsers } from "@/lib/ops/users";
import { makeUsers, withMode } from "./helpers";

describe("pembuatan akun massal", () => {
  it("rencana: validasi, duplikat, akun ada dilewati; pembuatan memakai kata sandi acak ter-hash dan tercatat pada audit", async () => {
    const u = await makeUsers("bulk");
    const existing = `bulk-rev@t.example`;
    const plan = await planUsers([
      { email: "Baru.Satu@Unit.Example", name: "Orang Satu", role: "reviewer" },
      { email: "baru.dua@unit.example", name: "Orang Dua", role: "HEAD" },
      { email: existing, name: "Sudah Ada", role: "REVIEWER" },
      { email: "", name: "Tanpa Email", role: "REVIEWER" },
      { email: "x@unit.example", name: "Peran Salah", role: "SUPERUSER" },
      { email: "baru.dua@unit.example", name: "Ganda", role: "REVIEWER" },
    ]);
    expect(plan.map((p) => p.action)).toEqual(["CREATE", "CREATE", "SKIP_EXISTS", "ERROR", "ERROR", "ERROR"]);
    const before = await prisma.user.findUniqueOrThrow({ where: { email: existing } });
    const created = await createUsers(plan, u.admin);
    expect(created.map((c) => c.email)).toEqual(["baru.satu@unit.example", "baru.dua@unit.example"]);
    for (const c of created) {
      expect(c.password).toHaveLength(16);
      const row = await prisma.user.findUniqueOrThrow({ where: { email: c.email } });
      expect(row.passwordHash).not.toContain(c.password);
      expect(await bcrypt.compare(c.password, row.passwordHash)).toBe(true);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { email: existing } })).passwordHash).toBe(before.passwordHash); // tidak diubah
    expect(await prisma.auditLog.count({ where: { action: "USER_CREATED", actorId: u.admin.id } })).toBeGreaterThanOrEqual(2);
    expect(new Set(Array.from({ length: 50 }, () => generatePassword())).size).toBe(50);
  });
  it("PILOT menolak domain demo", async () => {
    const plan = await withMode("PILOT", () => planUsers([{ email: "x@jd.example", name: "Demo", role: "REVIEWER" }]));
    expect(plan[0]).toMatchObject({ action: "ERROR" });
  });
});

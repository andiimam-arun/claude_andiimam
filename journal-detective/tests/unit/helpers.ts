import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export type U = { id: string; name: string; role: "STUDENT" | "REVIEWER" | "HEAD" | "ADMIN" };
export async function makeUsers(prefix: string) {
  const h = await bcrypt.hash("x", 4);
  const mk = async (role: U["role"], n: string) => { const u = await prisma.user.create({ data: { email: `${prefix}-${n}@t.example`, name: `${prefix}-${n}`, role, passwordHash: h } }); return { id: u.id, name: u.name, role } as U; };
  return { admin: await mk("ADMIN", "admin"), reviewer: await mk("REVIEWER", "rev"), head: await mk("HEAD", "head"), student: await mk("STUDENT", "stu") };
}
export const form = (over: Record<string, any> = {}): any => ({
  studentName: "Mahasiswa Uji", studentNumber: "K0123456", studyProgram: "Prodi Uji", supervisor: "Dr. Uji", studentEmail: "m@t.example",
  manuscriptTitle: "Judul Naskah Uji Integritas Jurnal 1B", researchField: "Kesehatan", stage: "PRE_SUBMISSION" as const, ...over,
});
export const withMode = async <T>(mode: "DEMO" | "PILOT", fn: () => Promise<T>) => {
  const prev = process.env.APP_MODE; process.env.APP_MODE = mode;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.APP_MODE; else process.env.APP_MODE = prev; }
};

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { prisma } from "../db";
import { ROLES, type Role } from "../engine/approval";
import { isPilot } from "../mode";
import { isDemoAccountEmail } from "./pilot";
import { audit, type Actor } from "../services/audit";

export interface UserRow { email: string; name: string; role: string }
export interface PlanItem { row: UserRow; action: "CREATE" | "SKIP_EXISTS" | "ERROR"; message?: string }

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // tanpa karakter yang mudah tertukar
export const generatePassword = (len = 16) => Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Rencana pembuatan akun (tanpa menulis apa pun). Akun yang sudah ada TIDAK diubah. */
export async function planUsers(rows: UserRow[]): Promise<PlanItem[]> {
  const seen = new Set<string>();
  const out: PlanItem[] = [];
  for (const raw of rows) {
    const row = { email: raw.email.trim().toLowerCase(), name: raw.name.trim(), role: raw.role.trim().toUpperCase() };
    if (!/^\S+@\S+\.\S+$/.test(row.email)) { out.push({ row, action: "ERROR", message: "Email tidak valid/kosong" }); continue; }
    if (!row.name) { out.push({ row, action: "ERROR", message: "Nama kosong" }); continue; }
    if (!ROLES.includes(row.role as Role)) { out.push({ row, action: "ERROR", message: `Peran tidak valid (${ROLES.join("/")})` }); continue; }
    if (isPilot() && isDemoAccountEmail(row.email)) { out.push({ row, action: "ERROR", message: "Domain demo @jd.example tidak diizinkan pada PILOT" }); continue; }
    if (seen.has(row.email)) { out.push({ row, action: "ERROR", message: "Email ganda pada daftar" }); continue; }
    seen.add(row.email);
    const exists = await prisma.user.findUnique({ where: { email: row.email } });
    out.push(exists ? { row, action: "SKIP_EXISTS", message: "Sudah ada; tidak diubah" } : { row, action: "CREATE" });
  }
  return out;
}

/** Membuat akun dengan kata sandi acak. Mengembalikan kredensial untuk ditulis ke berkas lokal (tidak pernah dicetak ke layar). */
export async function createUsers(plan: PlanItem[], actor: Actor): Promise<Array<{ email: string; name: string; role: string; password: string }>> {
  const created: Array<{ email: string; name: string; role: string; password: string }> = [];
  for (const p of plan.filter((x) => x.action === "CREATE")) {
    const password = generatePassword();
    const u = await prisma.user.create({ data: { email: p.row.email, name: p.row.name, role: p.row.role, passwordHash: await bcrypt.hash(password, 12) } });
    await audit(actor, "USER_CREATED", "User", u.id, { email: p.row.email, role: p.row.role, via: "users-bulk" });
    created.push({ email: p.row.email, name: p.row.name, role: p.row.role, password });
  }
  return created;
}

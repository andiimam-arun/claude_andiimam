import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "../db";
import type { Role } from "../engine/approval";
import { environmentProblems, isPilot } from "../mode";
import { isDemoAccountEmail } from "../ops/pilot";

const COOKIE = "jd_session";
const MAX_AGE = 60 * 60 * 8;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (>=32 karakter) wajib diatur di produksi");
    return new TextEncoder().encode("dev-only-insecure-secret-dev-only-insecure-secret");
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser { id: string; name: string; email: string; role: Role }

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/", maxAge: MAX_AGE });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Memverifikasi token DAN memastikan pengguna masih aktif (peran dibaca dari DB, bukan hanya dari token). */
export async function getSession(): Promise<SessionUser | null> {
  if ((await environmentProblems()).length) return null; // lingkungan tidak konsisten: tolak semua sesi
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const u = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!u || !u.active) return null;
    if (isPilot() && isDemoAccountEmail(u.email)) return null; // tidak ada kredensial demo pada PILOT
    return { id: u.id, name: u.name, email: u.email, role: u.role as Role };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const s = await requireUser();
  if (!roles.includes(s.role)) redirect("/?error=forbidden");
  return s;
}

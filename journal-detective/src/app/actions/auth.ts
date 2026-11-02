"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { audit } from "@/lib/services/audit";
import { go, str } from "./util";

// Pembatasan laju sederhana dalam memori (per email) untuk mencegah tebak kata sandi. Produksi: gunakan penyimpanan bersama.
const attempts = new Map<string, { n: number; until: number }>();

export async function loginAction(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const a = attempts.get(email);
  if (a && a.until > Date.now() && a.n >= 5) go("/login", { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." });
  const u = await prisma.user.findUnique({ where: { email } });
  const ok = u && u.active && (await bcrypt.compare(password, u.passwordHash));
  if (!ok) {
    attempts.set(email, { n: (a?.n ?? 0) + 1, until: Date.now() + 5 * 60_000 });
    await audit(null, "LOGIN_FAILED", "User", null, { email });
    go("/login", { error: "Email atau kata sandi salah." });
  }
  attempts.delete(email);
  await createSession({ id: u!.id, name: u!.name, email: u!.email, role: u!.role as any });
  await audit({ id: u!.id, name: u!.name, role: u!.role }, "LOGIN", "User", u!.id);
  go("/");
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await audit(s, "LOGOUT", "User", s.id);
  await destroySession();
  go("/login");
}

export async function setLangAction(form: FormData) {
  const lang = str(form, "lang") === "en" ? "en" : "id";
  (await cookies()).set("jd_lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const { headers } = await import("next/headers");
  const ref = (await headers()).get("referer");
  try { go(ref ? new URL(ref).pathname + new URL(ref).search.replace(/([?&])(notice|error)=[^&]*/g, "") : "/"); } catch { go("/"); }
}

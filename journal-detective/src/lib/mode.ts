import { prisma } from "./db";

/**
 * Lingkungan aplikasi: DEMO (data fiktif) atau PILOT (data nyata, tanpa data fiktif).
 * Ditentukan HANYA oleh APP_MODE di server. DEMO dan PILOT memakai basis data & folder unggahan terpisah.
 */
export type AppMode = "DEMO" | "PILOT";

export function getMode(): AppMode {
  return (process.env.APP_MODE ?? "DEMO").toUpperCase() === "PILOT" ? "PILOT" : "DEMO";
}
export const isPilot = () => getMode() === "PILOT";

export const DEMO_DEFAULT_DB = "file:./dev.db";
export const DEMO_DEFAULT_STORAGE = "./storage";

export interface EnvMarker { mode: AppMode; initializedAt: string; note?: string }

export async function readMarker(): Promise<EnvMarker | null> {
  const s = await prisma.setting.findUnique({ where: { key: "environment" } }).catch(() => null);
  if (!s) return null;
  try { return JSON.parse(s.valueJson) as EnvMarker; } catch { return null; }
}

export async function writeMarker(mode: AppMode, note?: string) {
  const v: EnvMarker = { mode, initializedAt: new Date().toISOString(), note };
  await prisma.setting.upsert({ where: { key: "environment" }, create: { key: "environment", valueJson: JSON.stringify(v) }, update: { valueJson: JSON.stringify(v) } });
  return v;
}

/** Aturan konfigurasi statis (tanpa DB): PILOT tidak boleh memakai lokasi bawaan DEMO. */
export function staticConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const p: string[] = [];
  if ((env.APP_MODE ?? "DEMO").toUpperCase() !== "PILOT") return p;
  const db = env.DATABASE_URL ?? "";
  const st = env.STORAGE_DIR ?? "./storage";
  if (!db || db === DEMO_DEFAULT_DB || /(^|[\\/])(dev|demo|test|e2e)\.db$/i.test(db)) p.push("DATABASE_URL pada mode PILOT tidak boleh memakai basis data DEMO/uji (mis. dev.db). Gunakan berkas terpisah, mis. file:./pilot.db atau PostgreSQL.");
  if (st === DEMO_DEFAULT_STORAGE || /storage-(demo|test|e2e)/i.test(st)) p.push("STORAGE_DIR pada mode PILOT tidak boleh memakai folder unggahan DEMO/uji (mis. ./storage). Gunakan folder terpisah, mis. ./storage-pilot.");
  return p;
}

let cache: { at: number; problems: string[] } | null = null;

/** Pemeriksaan lingkungan (cache 15 dtk): konfigurasi statis + penanda lingkungan pada basis data. */
export async function environmentProblems(force = false): Promise<string[]> {
  if (!force && cache && Date.now() - cache.at < 15_000) return cache.problems;
  const problems = staticConfigProblems();
  const marker = await readMarker();
  const mode = getMode();
  if (mode === "PILOT") {
    if (!marker) problems.push("Basis data belum diinisialisasi sebagai PILOT (jalankan `npm run pilot:init`).");
    else if (marker.mode !== "PILOT") problems.push(`Basis data ini bertanda ${marker.mode}, bukan PILOT. Mode PILOT menolak berjalan di atas basis data DEMO.`);
  } else if (marker && marker.mode === "PILOT") {
    problems.push("Basis data ini bertanda PILOT; mode DEMO menolak berjalan di atasnya agar data nyata tidak tercampur data fiktif.");
  }
  cache = { at: Date.now(), problems };
  return problems;
}
export const resetEnvironmentCache = () => { cache = null; };

export function officialPolicyBlockReason(policy: { isDemo: boolean }): string | null {
  return isPilot() && policy.isDemo ? "Kebijakan resmi belum dikonfigurasi" : null;
}

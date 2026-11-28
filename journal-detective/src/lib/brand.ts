import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const APP_NAME = "Journal Assessment";
export const FACULTY_EN = "Faculty of Public Health";
export const FACULTY_ID = "Fakultas Kesehatan Masyarakat";
export const UNIVERSITY = "Universitas Hasanuddin";

const EXT = ["png", "jpg", "jpeg", "svg"] as const;
const dir = () => path.join(process.cwd(), "public", "branding");

/** Logo UNHAS resmi: letakkan berkas `public/branding/logo-unhas.png` (atau .jpg/.svg). Aplikasi tidak membuat/menggambar logo sendiri. */
export function findLogo(): { url: string; file: string; ext: (typeof EXT)[number] } | null {
  for (const ext of EXT) {
    const file = path.join(dir(), `logo-unhas.${ext}`);
    if (existsSync(file)) return { url: `/branding/logo-unhas.${ext}`, file, ext };
  }
  return null;
}

/** Byte logo untuk PDF (hanya PNG/JPG yang dapat disematkan pada PDF; SVG hanya untuk layar). */
export function logoForPdf(): { bytes: Uint8Array; kind: "png" | "jpg" } | null {
  const l = findLogo();
  if (!l || l.ext === "svg") return null;
  try { return { bytes: readFileSync(l.file), kind: l.ext === "png" ? "png" : "jpg" }; } catch { return null; }
}

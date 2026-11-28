import { ShieldCheck } from "lucide-react";
import { findLogo } from "@/lib/brand";

/** Logo UNHAS bila berkas tersedia; jika belum, ikon netral (bukan tiruan logo). */
export function BrandLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  const l = findLogo();
  // eslint-disable-next-line @next/next/no-img-element
  // Logo UNHAS tidak persegi (±5:6): tinggi tetap, lebar menyesuaikan, tanpa dipotong/diubah.
  return l ? <img src={l.url} alt="Logo Universitas Hasanuddin" height={size} className={`shrink-0 object-contain ${className}`} style={{ height: size, width: "auto" }} /> : <ShieldCheck className={`shrink-0 text-white ${className}`} style={{ width: size, height: size }} aria-hidden />;
}

import { ShieldCheck } from "lucide-react";
import { findLogo } from "@/lib/brand";

/** Logo UNHAS bila berkas tersedia; jika belum, ikon netral (bukan tiruan logo). */
export function BrandLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  const l = findLogo();
  // eslint-disable-next-line @next/next/no-img-element
  return l ? <img src={l.url} alt="Logo Universitas Hasanuddin" width={size} height={size} className={`shrink-0 rounded-full bg-white object-contain p-0.5 ${className}`} style={{ width: size, height: size }} /> : <ShieldCheck className={`shrink-0 text-white ${className}`} style={{ width: size, height: size }} aria-hidden />;
}

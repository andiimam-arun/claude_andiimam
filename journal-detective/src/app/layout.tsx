import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { getLang } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Journal Detective",
  description: "Verifikasi Jurnal. Lindungi Riset. Dukung Integritas Akademik.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}

import { NextResponse, type NextRequest } from "next/server";

// Pemeriksaan ringan: wajib ada cookie sesi. Verifikasi token & peran dilakukan di server (getSession) pada setiap halaman/aksi.
export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p === "/login" || p.startsWith("/verify/") || p.startsWith("/_next") || p === "/favicon.ico") return NextResponse.next();
  if (!req.cookies.get("jd_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

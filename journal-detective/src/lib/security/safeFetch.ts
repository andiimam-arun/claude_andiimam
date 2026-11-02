import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { Agent, EnvHttpProxyAgent, fetch as ufetch } from "undici";

/**
 * Fetch aman untuk URL yang tidak tepercaya (pertahanan SSRF):
 * hanya http/https, port 80/443, tanpa kredensial, menolak IP privat/loopback/link-local/metadata,
 * validasi ulang setiap pengalihan, batas waktu dan ukuran, tipe konten dibatasi.
 * Konten yang diambil adalah DATA, tidak pernah instruksi (lihat sanitize.ts).
 */

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::" || x.startsWith("fe80") || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("ff")) return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return true;
}

export class UnsafeUrlError extends Error {}

export async function assertSafeUrl(raw: string, opts: { skipDns?: boolean } = {}): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL tidak valid");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("Protokol tidak diizinkan");
  if (u.username || u.password) throw new UnsafeUrlError("Kredensial dalam URL tidak diizinkan");
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw new UnsafeUrlError("Port tidak diizinkan");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new UnsafeUrlError("Host internal ditolak");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError("Alamat IP privat ditolak");
    return u;
  }
  // Bila lewat proxy keluar, proxy yang me-resolve nama; pra-cek DNS lokal dilewati (kendalikan egress di proxy/firewall).
  if (opts.skipDns) return u;
  const addrs = await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new UnsafeUrlError("Host tidak dapat di-resolve");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError("Host me-resolve ke alamat privat");
  return u;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  text: string;
  truncated: boolean;
  retryAfter?: string | null;
}

const ALLOWED_TYPES = ["text/html", "application/json", "text/plain", "application/xhtml+xml", "application/xml", "text/xml"];

export async function safeFetch(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; headers?: Record<string, string>; allowPrivate?: boolean } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = 8000, maxBytes = 512 * 1024, maxRedirects = 3 } = opts;
  const proxied = !!(process.env.HTTPS_PROXY || process.env.https_proxy);
  let url = opts.allowPrivate ? new URL(rawUrl) : await assertSafeUrl(rawUrl, { skipDns: proxied });
  const dispatcher = proxied
    ? new EnvHttpProxyAgent()
    : new Agent({
        connect: {
          lookup: (hostname, options, cb) => {
            dns.lookup(hostname, { all: true }).then(
              (addrs) => {
                const bad = addrs.find((a) => isPrivateIp(a.address));
                if (bad) return (cb as any)(new UnsafeUrlError("Alamat privat saat koneksi"), "", 0);
                if ((options as any)?.all) return (cb as any)(null, addrs);
                (cb as any)(null, addrs[0].address, addrs[0].family);
              },
              (e) => (cb as any)(e, "", 0),
            );
          },
        },
      });

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await ufetch(url, {
          redirect: "manual",
          signal: ctl.signal,
          dispatcher,
          headers: { "user-agent": "JournalDetective/0.1 (integritas publikasi; kontak: unit publikasi)", accept: "text/html,application/json;q=0.9,*/*;q=0.1", ...opts.headers },
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (hop === maxRedirects) throw new UnsafeUrlError("Terlalu banyak pengalihan");
        const next = new URL(res.headers.get("location")!, url);
        url = opts.allowPrivate ? next : await assertSafeUrl(next.toString(), { skipDns: proxied });
        await res.body?.cancel();
        continue;
      }
      const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (ct && !ALLOWED_TYPES.includes(ct)) {
        await res.body?.cancel();
        throw new UnsafeUrlError(`Tipe konten tidak diizinkan: ${ct}`);
      }
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let truncated = false;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          truncated = true;
          chunks.push(value.slice(0, value.length - (total - maxBytes)));
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      return { ok: res.ok, status: res.status, finalUrl: url.toString(), contentType: ct, text: Buffer.concat(chunks).toString("utf8"), truncated, retryAfter: res.headers.get("retry-after") };
    }
    throw new UnsafeUrlError("Terlalu banyak pengalihan");
  } finally {
    await dispatcher.close().catch(() => undefined);
  }
}

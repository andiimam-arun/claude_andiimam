import "server-only";
import { cookies } from "next/headers";
import { parseLang, t as tt, type Lang } from "./index";

export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get("jd_lang")?.value);
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: (k: string, p?: Record<string, string | number>) => tt(lang, k, p) };
}

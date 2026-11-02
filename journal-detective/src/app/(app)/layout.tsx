import { requireUser } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n/server";
import { getActivePolicy } from "@/lib/services/policyService";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [lang, policy] = await Promise.all([getLang(), getActivePolicy()]);
  return <AppShell user={user} lang={lang} demoPolicy={policy.isDemo}>{children}</AppShell>;
}

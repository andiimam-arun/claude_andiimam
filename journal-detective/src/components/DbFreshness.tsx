import Link from "next/link";
import { updateStatus } from "@/lib/services/dbUpdate";
import { Notice } from "@/components/ui/card";

/** Peringatan bila database rujukan kedaluwarsa/belum ada. Tidak mengubah keputusan; hanya mengingatkan operator. */
export async function DbFreshnessNotice({ lang }: { lang: string }) {
  const L = lang === "id";
  const bad = (await updateStatus()).filter((s) => s.state !== "OK");
  if (!bad.length) return null;
  return (
    <Notice kind="warn">
      <span className="font-semibold">{L ? "Database rujukan perlu diperbarui: " : "Reference database needs updating: "}</span>
      {bad.map((s) => (s.state === "NEVER" ? (L ? `${s.label} belum pernah diimpor` : `${s.label} never imported`) : (L ? `${s.label} berumur ${s.ageDays} hari (batas ${s.thresholdDays})` : `${s.label} is ${s.ageDays} days old (limit ${s.thresholdDays})`))).join("; ")}.{" "}
      <Link className="font-semibold underline" href="/sources">{L ? "Buka Sumber Rujukan" : "Open Reference Sources"}</Link>
    </Notice>
  );
}

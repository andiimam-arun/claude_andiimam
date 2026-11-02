import { prisma } from "../db";
import { normalizeIssn } from "../engine/issn";
import { normalizeTitle, parseJson, uniq } from "../engine/util";
import type { JournalIdentityInput } from "../engine/types";
import type { Journal } from "@prisma/client";

export interface RegistryMatch { journal: Journal; matchedBy: Array<"ISSN" | "EISSN" | "SOURCE_ID" | "TITLE"> }

/** Cari registri berdasarkan ISSN, Source ID, lalu judul ternormalisasi (identifier lebih dahulu). */
export async function searchRegistry(q: { issn?: string | null; eissn?: string | null; scopusSourceId?: string | null; title?: string | null }): Promise<RegistryMatch[]> {
  const issns = [q.issn, q.eissn].map((x) => normalizeIssn(x)).filter(Boolean) as string[];
  const or: any[] = [];
  if (issns.length) or.push({ issn: { in: issns } }, { eissn: { in: issns } });
  if (q.scopusSourceId) or.push({ scopusSourceId: q.scopusSourceId });
  const nt = normalizeTitle(q.title);
  if (nt) or.push({ normTitle: nt });
  if (!or.length) return [];
  const js = await prisma.journal.findMany({ where: { OR: or } });
  return js.map((j) => {
    const by: RegistryMatch["matchedBy"] = [];
    if (issns.includes(j.issn ?? "")) by.push("ISSN");
    if (issns.includes(j.eissn ?? "")) by.push("EISSN");
    if (q.scopusSourceId && j.scopusSourceId === q.scopusSourceId) by.push("SOURCE_ID");
    if (nt && j.normTitle === nt) by.push("TITLE");
    return { journal: j, matchedBy: by };
  }).sort((a, b) => (b.matchedBy.includes("ISSN") ? 1 : 0) - (a.matchedBy.includes("ISSN") ? 1 : 0));
}

export function journalToInput(j: Journal): JournalIdentityInput {
  return {
    title: j.title, altTitles: parseJson(j.altTitlesJson, []), issn: j.issn, eissn: j.eissn, scopusSourceId: j.scopusSourceId, publisher: j.publisher,
    country: j.country, officialWebsite: j.officialWebsite, subjects: parseJson(j.subjectsJson, []), claimedIndexing: parseJson(j.claimedIndexingJson, []),
  };
}

/** Membuat/memperbarui catatan jurnal tanpa menghapus informasi yang sudah ada. Versi naik bila identitas berubah. */
export async function upsertJournal(input: JournalIdentityInput, opts: { isDemo?: boolean } = {}): Promise<{ journal: Journal; created: boolean; existing: RegistryMatch[] }> {
  const issn = normalizeIssn(input.issn);
  const eissn = normalizeIssn(input.eissn);
  const existing = await searchRegistry({ issn, eissn, scopusSourceId: input.scopusSourceId, title: input.title });
  const primary = existing.find((m) => m.matchedBy.some((b) => b !== "TITLE")) ?? existing.find((m) => m.matchedBy.includes("TITLE"));
  if (!primary) {
    const j = await prisma.journal.create({
      data: {
        title: input.title.trim(), normTitle: normalizeTitle(input.title), altTitlesJson: JSON.stringify(input.altTitles), issn, eissn,
        scopusSourceId: input.scopusSourceId || null, publisher: input.publisher || null, country: input.country || null,
        officialWebsite: input.officialWebsite || null, subjectsJson: JSON.stringify(input.subjects), claimedIndexingJson: JSON.stringify(input.claimedIndexing), isDemo: !!opts.isDemo,
      },
    });
    return { journal: j, created: true, existing };
  }
  const cur = primary.journal;
  const alts = uniq([...parseJson<string[]>(cur.altTitlesJson, []), ...(normalizeTitle(input.title) !== cur.normTitle ? [input.title.trim()] : []), ...input.altTitles].filter(Boolean));
  const claimed = uniq([...parseJson<string[]>(cur.claimedIndexingJson, []), ...input.claimedIndexing]);
  const changed = (issn && issn !== cur.issn && !cur.issn) || (eissn && !cur.eissn) || (input.scopusSourceId && !cur.scopusSourceId) || (input.publisher && !cur.publisher) || alts.length !== parseJson<string[]>(cur.altTitlesJson, []).length;
  const j = await prisma.journal.update({
    where: { id: cur.id },
    data: {
      issn: cur.issn ?? issn, eissn: cur.eissn ?? eissn, scopusSourceId: cur.scopusSourceId ?? (input.scopusSourceId || null),
      publisher: cur.publisher ?? (input.publisher || null), country: cur.country ?? (input.country || null),
      altTitlesJson: JSON.stringify(alts), claimedIndexingJson: JSON.stringify(claimed),
      subjectsJson: JSON.stringify(uniq([...parseJson<string[]>(cur.subjectsJson, []), ...input.subjects])),
      recordVersion: changed ? { increment: 1 } : undefined,
    },
  });
  return { journal: j, created: false, existing };
}

import { prisma } from "../db";

export interface Branding {
  institution: string;
  faculty: string;
  unit: string;
  address: string;
  approverName: string;
  approverTitle: string;
  approverNip: string;
  city: string;
}

export const DEFAULT_BRANDING: Branding = {
  institution: "Universitas Hasanuddin",
  faculty: "[Nama Fakultas — isi oleh administrator]",
  unit: "Unit Publikasi Fakultas",
  address: "[Alamat resmi fakultas — isi oleh administrator]",
  approverName: "",
  approverTitle: "Ketua Unit Publikasi Fakultas",
  approverNip: "",
  city: "Makassar",
};

export interface LetterTemplates {
  PRE_SUBMISSION: { title: string; opening: string; approval: string; closing: string };
  POST_ACCEPTANCE_PAYMENT: { title: string; opening: string; approval: string; closing: string };
}

export const DEFAULT_TEMPLATES: LetterTemplates = {
  PRE_SUBMISSION: {
    title: "SURAT KETERANGAN KLIRENS JURNAL (PRA-PENGIRIMAN)",
    opening: "Berdasarkan hasil penilaian integritas jurnal oleh Unit Publikasi, dengan ini diterangkan bahwa mahasiswa di bawah ini:",
    approval: "Hasil penilaian ini merupakan dasar pertimbangan institusional dan disetujui oleh pejabat berwenang yang tertera di bawah, berdasarkan kebijakan klirens yang berlaku (versi {{policyVersion}}).",
    closing: "Surat ini hanya berlaku untuk jurnal, situs resmi, dan naskah yang disebutkan di atas, serta tidak menggantikan tanggung jawab penulis untuk memeriksa ulang tujuan pengiriman dan pembayaran.",
  },
  POST_ACCEPTANCE_PAYMENT: {
    title: "SURAT KETERANGAN KLIRENS PASCA-PENERIMAAN (PROSES PEMBAYARAN PUBLIKASI)",
    opening: "Berdasarkan hasil penilaian integritas jurnal serta peninjauan bukti proses editorial oleh Unit Publikasi, dengan ini diterangkan bahwa mahasiswa di bawah ini:",
    approval: "Klirens ini disetujui oleh pejabat berwenang yang tertera di bawah berdasarkan kebijakan klirens yang berlaku (versi {{policyVersion}}). Pembayaran hanya boleh dilakukan melalui tujuan pembayaran yang telah diverifikasi pada situs resmi penerbit.",
    closing: "Surat ini tidak menjamin penerbitan artikel dan tidak mengesahkan pembayaran ke pihak lain di luar penerbit resmi yang disebutkan di atas.",
  },
};

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await prisma.setting.findUnique({ where: { key } });
  if (!s) return fallback;
  try { return { ...fallback, ...JSON.parse(s.valueJson) } as T; } catch { return fallback; }
}

export const getBranding = () => getSetting<Branding>("branding", DEFAULT_BRANDING);
export const getTemplates = () => getSetting<LetterTemplates>("letterTemplates", DEFAULT_TEMPLATES);

export async function saveSetting(key: string, value: unknown) {
  await prisma.setting.upsert({ where: { key }, create: { key, valueJson: JSON.stringify(value) }, update: { valueJson: JSON.stringify(value) } });
}

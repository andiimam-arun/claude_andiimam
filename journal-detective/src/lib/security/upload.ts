export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface AllowedType { ext: string; mime: string; magic: (b: Buffer) => boolean }

const startsWith = (b: Buffer, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Format yang disetujui secara eksplisit. Validasi berdasarkan magic bytes, bukan hanya ekstensi/MIME klaim. */
export const ALLOWED_TYPES: AllowedType[] = [
  { ext: "pdf", mime: "application/pdf", magic: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  { ext: "png", mime: "image/png", magic: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  { ext: "jpg", mime: "image/jpeg", magic: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { ext: "jpeg", mime: "image/jpeg", magic: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { ext: "txt", mime: "text/plain", magic: (b) => !b.subarray(0, 2048).includes(0) },
  { ext: "eml", mime: "message/rfc822", magic: (b) => !b.subarray(0, 2048).includes(0) },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
];

export function validateUpload(filename: string, size: number, head: Buffer): { ok: true; type: AllowedType; safeName: string } | { ok: false; error: string } {
  if (size <= 0) return { ok: false, error: "File kosong" };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: `Ukuran file melebihi ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` };
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const type = ALLOWED_TYPES.find((t) => t.ext === ext);
  if (!type) return { ok: false, error: `Format .${ext} tidak diizinkan (PDF, PNG, JPG, TXT, EML, DOCX)` };
  if (!type.magic(head)) return { ok: false, error: "Isi file tidak sesuai dengan ekstensinya" };
  const safeName = filename.replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".").slice(-120) || `dokumen.${ext}`;
  return { ok: true, type, safeName };
}

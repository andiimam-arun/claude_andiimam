declare module "pdf-parse/lib/pdf-parse.js" {
  const fn: (data: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string; numpages: number }>;
  export default fn;
}

declare module "*.css";

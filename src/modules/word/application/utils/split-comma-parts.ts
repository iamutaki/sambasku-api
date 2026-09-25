/** Pecah teks berkoma jadi parts (trim, buang kosong). */
export function splitCommaParts(text: string): string[] {
  return text
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Validasi parts dari UI sebelum apply. */
export function normalizeSplitParts(parts: string[]): string[] {
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

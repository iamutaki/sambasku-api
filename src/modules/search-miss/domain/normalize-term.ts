/** Normalisasi term search-miss: trim + lower + rapikan spasi. */
export function normalizeSearchMissTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 255);
}

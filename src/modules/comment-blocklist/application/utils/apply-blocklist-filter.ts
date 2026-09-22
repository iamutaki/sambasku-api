/**
 * Ganti whole-word match (case-insensitive) dengan *** .
 * Word boundary sederhana: non-huruf/digit di kiri-kanan.
 */
export function applyBlocklistFilter(body: string, blockedWords: string[]): string {
  if (blockedWords.length === 0) return body;

  let result = body;
  for (const raw of blockedWords) {
    const word = raw.trim();
    if (!word) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
    result = result.replace(re, '***');
  }
  return result;
}

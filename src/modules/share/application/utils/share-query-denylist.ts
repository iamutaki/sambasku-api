/**
 * Denylist query Media Explorer (EN/ID singkat).
 * Best-effort - eufemisme / bahasa lain tetap bisa lolos flag provider.
 */
const BLOCKED_TERMS = [
  'porn',
  'porno',
  'xxx',
  'nsfw',
  'nude',
  'nudes',
  'naked',
  'nudity',
  'erotic',
  'hentai',
  'sex',
  'sexy',
  'boobs',
  'breast',
  'breasts',
  'vagina',
  'penis',
  'blowjob',
  'onlyfans',
  'telanjang',
  'bugil',
  'bokep',
  'pornografi',
  'seks',
  'erotis',
] as const;

function normalizeQuery(query: string): string {
  return query
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True jika query mengandung istilah yang diblok. */
export function isBlockedShareQuery(query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return false;
  const tokens = new Set(normalized.split(' '));
  for (const term of BLOCKED_TERMS) {
    if (tokens.has(term)) return true;
    if (term.includes(' ') && normalized.includes(term)) return true;
  }
  return false;
}

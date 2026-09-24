/**
 * Perata rantai error (`cause` berantai). Dipakai dua pendeteksi yang sama-sama
 * harus melihat ke dalam error terbungkus: constraint SQLite
 * (`database/drizzle/sqlite-errors.ts`) dan kegagalan kapasitas runtime
 * (`infra-failure.ts`).
 *
 * Kedalaman dibatasi 4 supaya `cause` siklik tidak membuat rekursi tak habis.
 */

export function collectMessages(err: unknown, depth = 0): string[] {
  if (depth > 4 || err == null) return [];
  const out: string[] = [];
  if (err instanceof Error) {
    out.push(err.message);
    out.push(...collectMessages((err as Error & { cause?: unknown }).cause, depth + 1));
  } else if (typeof err === 'object') {
    const o = err as { message?: unknown; cause?: unknown; code?: unknown };
    if (o.message != null) out.push(String(o.message));
    if (o.code != null) out.push(String(o.code));
    out.push(...collectMessages(o.cause, depth + 1));
  } else {
    out.push(String(err));
  }
  return out;
}

export function collectCodes(err: unknown, depth = 0): string[] {
  if (depth > 4 || err == null || typeof err !== 'object') return [];
  const o = err as { code?: unknown; cause?: unknown; extendedCode?: unknown };
  const out: string[] = [];
  if (o.code != null) out.push(String(o.code));
  if (o.extendedCode != null) out.push(String(o.extendedCode));
  out.push(...collectCodes(o.cause, depth + 1));
  return out;
}

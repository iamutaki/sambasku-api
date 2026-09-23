/** Deteksi constraint SQLite/libSQL (pengganti kode Postgres 23505 / 23503). */

function collectMessages(err: unknown, depth = 0): string[] {
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

function collectCodes(err: unknown, depth = 0): string[] {
  if (depth > 4 || err == null || typeof err !== 'object') return [];
  const o = err as { code?: unknown; cause?: unknown; extendedCode?: unknown };
  const out: string[] = [];
  if (o.code != null) out.push(String(o.code));
  if (o.extendedCode != null) out.push(String(o.extendedCode));
  out.push(...collectCodes(o.cause, depth + 1));
  return out;
}

export function isUniqueViolation(err: unknown): boolean {
  const codes = collectCodes(err);
  if (
    codes.some(
      (c) =>
        c === 'SQLITE_CONSTRAINT_UNIQUE' ||
        c === 'SQLITE_CONSTRAINT' ||
        c === '23505',
    )
  ) {
    const msgs = collectMessages(err).join(' ').toLowerCase();
    // SQLITE_CONSTRAINT generik: pastikan unique, bukan FK
    if (codes.includes('SQLITE_CONSTRAINT_UNIQUE') || codes.includes('23505')) return true;
    return msgs.includes('unique');
  }
  const msgs = collectMessages(err).join(' ').toLowerCase();
  return msgs.includes('unique constraint') || msgs.includes('unique constraint failed');
}

export function isForeignKeyViolation(err: unknown): boolean {
  const codes = collectCodes(err);
  if (
    codes.some(
      (c) =>
        c === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
        c === '23503',
    )
  ) {
    return true;
  }
  const msgs = collectMessages(err).join(' ').toLowerCase();
  return msgs.includes('foreign key');
}

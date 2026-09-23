/** Deteksi constraint SQLite/libSQL (pengganti kode Postgres 23505 / 23503). */

import { collectCodes, collectMessages } from '@/shared/errors/error-chain';

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

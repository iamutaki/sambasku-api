import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

/** Case-insensitive LIKE (pengganti Postgres ilike). Pattern sudah boleh berisi %/_ . */
export function ilikeCompat(column: SQLWrapper, pattern: string): SQL {
  return sql`lower(${column}) like ${pattern.toLowerCase()}`;
}

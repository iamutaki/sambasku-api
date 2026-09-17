import { integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Pencarian kosong (miss) - jadi peluang kontribusi di beranda
// (03-api-kontribusi-verifikasi.md): user cari "kalintiak" tidak ketemu →
// tercatat di sini, muncul di beranda user lain supaya kontributor mengisi.
// Fulfilment TIDAK disimpan kolom - derived lewat JOIN words saat dibaca
// (kata published dengan lemma = term → miss terjawab).
export const searchMisses = pgTable(
  'search_misses',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    // kata yang dicari - normalized lower(trim), jadi unik per istilah
    term: varchar('term', { length: 255 }).notNull(),
    // lemma = Sambas→Indonesia (kata tidak ada); translation = Indonesia→Sambas
    direction: varchar('direction', { length: 20 }).notNull().default('lemma'),
    hitCount: integer('hit_count').notNull().default(1),
    lastSearchedAt: timestamp('last_searched_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [unique('search_misses_term_direction_unique').on(t.term, t.direction)],
);

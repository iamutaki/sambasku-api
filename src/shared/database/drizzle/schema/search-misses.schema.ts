import { boolean, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Pencarian kosong (miss) - jadi peluang kontribusi di beranda
// (03-api + 14-api): user cari "kalintiak" tidak ketemu → tercatat di sini.
// Tayang di beranda hanya jika is_visible=true (default false; admin gate).
// Fulfilment TIDAK disimpan kolom - derived lewat JOIN words saat dibaca
// (kata published dengan lemma = term → miss terjawab).
export const searchMisses = pgTable(
  'search_misses',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    // kata yang dicari - normalized lower(trim), jadi unik per istilah
    // (boleh dikoreksi admin via PATCH - 14-api)
    term: varchar('term', { length: 255 }).notNull(),
    // lemma = Sambas→Indonesia (kata tidak ada); translation = Indonesia→Sambas
    direction: varchar('direction', { length: 20 }).notNull().default('lemma'),
    hitCount: integer('hit_count').notNull().default(1),
    lastSearchedAt: timestamp('last_searched_at').notNull().defaultNow(),
    // Gate beranda: false = panel admin saja (14-api-search-miss-moderation.md)
    isVisible: boolean('is_visible').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [unique('search_misses_term_direction_unique').on(t.term, t.direction)],
);

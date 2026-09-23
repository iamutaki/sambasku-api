import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Pencarian kosong (miss) - jadi peluang kontribusi di beranda
// (03-api + 14-api): user cari "kalintiak" tidak ketemu → tercatat di sini.
// Tayang di beranda hanya jika is_visible=true (default false; admin gate).
// Fulfilment TIDAK disimpan kolom - derived lewat JOIN words saat dibaca
// (kata published dengan lemma = term → miss terjawab).
export const searchMisses = sqliteTable(
  'search_misses',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    // kata yang dicari - normalized lower(trim), jadi unik per istilah
    // (boleh dikoreksi admin via PATCH - 14-api)
    term: text('term').notNull(),
    // lemma = Sambas→Indonesia (kata tidak ada); translation = Indonesia→Sambas
    direction: text('direction').notNull().default('lemma'),
    hitCount: integer('hit_count').notNull().default(1),
    lastSearchedAt: integer('last_searched_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    // Gate beranda: false = panel admin saja (14-api-search-miss-moderation.md)
    isVisible: integer('is_visible', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [unique('search_misses_term_direction_unique').on(t.term, t.direction)],
);

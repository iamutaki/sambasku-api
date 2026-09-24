import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { words } from './words.schema';
import { wordImages } from './word-images.schema';

/** Laporan entri/foto yang tayang. Open unik per (kata, pelapor[, foto]). */
export const wordReports = sqliteTable(
  'word_reports',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    /** Null = laporan entri kata; terisi = laporan foto spesifik (kekerasan). */
    imageId: text('image_id').references(() => wordImages.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    reasonCode: text('reason_code').notNull(),
    note: text('note'),
    status: text('status').notNull().default('open'),
    resolution: text('resolution'),
    resolutionNote: text('resolution_note'),
    resolvedBy: text('resolved_by').references(() => users.id),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('word_reports_status_id_idx').on(t.status, t.id),
    index('word_reports_word_id_idx').on(t.wordId),
    uniqueIndex('word_reports_open_user_word_idx')
      .on(t.wordId, t.userId)
      .where(sql`${t.status} = 'open' AND ${t.imageId} IS NULL`),
    uniqueIndex('word_reports_open_user_word_image_idx')
      .on(t.wordId, t.userId, t.imageId)
      .where(sql`${t.status} = 'open' AND ${t.imageId} IS NOT NULL`),
  ],
);

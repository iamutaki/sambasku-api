import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users.schema';

/** Satu run impor massal (CSV / lembar) - ringkasan + item untuk riwayat admin. */
export const wordImportSessions = sqliteTable(
  'word_import_sessions',
  {
    id: text('id').primaryKey(),
    triggeredBy: text('triggered_by')
      .notNull()
      .references(() => users.id),
    attributedTo: text('attributed_to')
      .notNull()
      .references(() => users.id),
    sourceLabel: text('source_label'),
    status: text('status').notNull(),
    total: integer('total').notNull().default(0),
    createdCount: integer('created_count').notNull().default(0),
    duplicatesCount: integer('duplicates_count').notNull().default(0),
    meaningsAddedCount: integer('meanings_added_count').notNull().default(0),
    invalidCount: integer('invalid_count').notNull().default(0),
    itemsJson: text('items_json').notNull().default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
  },
  (t) => [index('word_import_sessions_finished_id_idx').on(t.finishedAt, t.id)],
);

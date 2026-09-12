import { index, pgTable, timestamp, varchar, text } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { languages } from './languages.schema';
import { users } from './users.schema';

// 'draft' | 'pending_review' | 'published' — alur per role ada di
// CreateWordUseCase (docs/api/01-api-tambah-kata.md)
export const words = pgTable(
  'words',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    languageId: varchar('language_id', { length: 26 })
      .notNull()
      .references(() => languages.id),
    lemma: varchar('lemma', { length: 255 }).notNull(),
    notes: text('notes'),
    // word | idiom | peribahasa | ungkapan — jenis entri, bukan topik
    // (topik = categories). Mengaktifkan relasi has_component & filter search.
    wordType: varchar('word_type', { length: 30 }).notNull().default('word'),
    status: varchar('status', { length: 30 }).notNull().default('draft'),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [index('words_language_lemma_idx').on(t.languageId, t.lemma)],
);

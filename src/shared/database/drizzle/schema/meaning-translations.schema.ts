import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { meanings } from './meanings.schema';
import { languages } from './languages.schema';
import { users } from './users.schema';

export const meaningTranslations = sqliteTable(
  'meaning_translations',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    meaningId: text('meaning_id')
      .notNull()
      .references(() => meanings.id),
    languageId: text('language_id')
      .notNull()
      .references(() => languages.id),
    translationText: text('translation_text').notNull(),
    // direct | descriptive | idiomatic
    translationType: text('translation_type').notNull().default('direct'),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    updatedBy: text('updated_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (t) => [
    unique('meaning_translations_unique').on(t.meaningId, t.languageId, t.translationText),
  ],
);

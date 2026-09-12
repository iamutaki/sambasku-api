import { pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { meanings } from './meanings.schema';
import { languages } from './languages.schema';
import { users } from './users.schema';

export const meaningTranslations = pgTable(
  'meaning_translations',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    meaningId: varchar('meaning_id', { length: 26 })
      .notNull()
      .references(() => meanings.id),
    languageId: varchar('language_id', { length: 26 })
      .notNull()
      .references(() => languages.id),
    translationText: text('translation_text').notNull(),
    // direct | descriptive | idiomatic
    translationType: varchar('translation_type', { length: 50 }).notNull().default('direct'),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    unique('meaning_translations_unique').on(t.meaningId, t.languageId, t.translationText),
  ],
);

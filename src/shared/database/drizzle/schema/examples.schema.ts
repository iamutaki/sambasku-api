import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { meanings } from './meanings.schema';
import { languages } from './languages.schema';
import { users } from './users.schema';

export const examples = pgTable('examples', {
  id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
  meaningId: varchar('meaning_id', { length: 26 })
    .notNull()
    .references(() => meanings.id),
  sourceLanguageId: varchar('source_language_id', { length: 26 })
    .notNull()
    .references(() => languages.id),
  sourceSentence: text('source_sentence').notNull(),
  targetLanguageId: varchar('target_language_id', { length: 26 }).references(() => languages.id),
  targetSentence: text('target_sentence'),
  // native_speaker | book | corpus | interview | other
  sourceType: varchar('source_type', { length: 50 }),
  sourceReference: text('source_reference'),
  notes: text('notes'),
  createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
  updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at'),
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
});

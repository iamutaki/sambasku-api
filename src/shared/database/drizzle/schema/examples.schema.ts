import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { meanings } from './meanings.schema';
import { languages } from './languages.schema';
import { users } from './users.schema';

export const examples = sqliteTable('examples', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  meaningId: text('meaning_id')
    .notNull()
    .references(() => meanings.id),
  sourceLanguageId: text('source_language_id')
    .notNull()
    .references(() => languages.id),
  sourceSentence: text('source_sentence').notNull(),
  targetLanguageId: text('target_language_id').references(() => languages.id),
  targetSentence: text('target_sentence'),
  // native_speaker | book | corpus | interview | other
  sourceType: text('source_type'),
  sourceReference: text('source_reference'),
  notes: text('notes'),
  // Approval gate (Section 22) - kontribusi mandiri: pending sampai
  // disetujui verifikator; identitas reviewer ada di contribution_reviews
  status: text('status').notNull().default('published'),
  isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
  isCorrected: integer('is_corrected', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by').references(() => users.id),
  updatedBy: text('updated_by').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  deletedBy: text('deleted_by').references(() => users.id),
});

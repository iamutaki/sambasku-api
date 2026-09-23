import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { dialects } from './dialects.schema';
import { users } from './users.schema';

export const pronunciations = sqliteTable(
  'pronunciations',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    dialectId: text('dialect_id').references(() => dialects.id),
    notation: text('notation').notNull().default('ipa'),
    value: text('value').notNull(),
    audioUrl: text('audio_url'),
    speakerName: text('speaker_name'),
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
  },
  (t) => [unique('pronunciations_unique').on(t.wordId, t.dialectId, t.notation, t.value)],
);

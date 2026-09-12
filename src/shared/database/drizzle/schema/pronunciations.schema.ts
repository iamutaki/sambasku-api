import { pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { dialects } from './dialects.schema';
import { users } from './users.schema';

export const pronunciations = pgTable(
  'pronunciations',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    dialectId: varchar('dialect_id', { length: 26 }).references(() => dialects.id),
    notation: varchar('notation', { length: 50 }).notNull().default('ipa'),
    value: varchar('value', { length: 500 }).notNull(),
    audioUrl: text('audio_url'),
    speakerName: varchar('speaker_name', { length: 255 }),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [unique('pronunciations_unique').on(t.wordId, t.dialectId, t.notation, t.value)],
);

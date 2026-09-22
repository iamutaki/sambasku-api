import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { examples } from './examples.schema';
import { dialects } from './dialects.schema';
import { users } from './users.schema';

// Audio pelafalan multi-take per kata (dan opsional per contoh kalimat).
// Provider-agnostic: `provider` + `provider_file_id` (pola word_images).
// example_id NULL = pelafalan lemma; terisi = pelafalan kalimat contoh.
export const wordAudios = sqliteTable(
  'word_audios',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    exampleId: text('example_id').references(() => examples.id),
    dialectId: text('dialect_id').references(() => dialects.id),
    provider: text('provider').notNull().default('github'),
    providerFileId: text('provider_file_id').notNull(),
    sha: text('sha'),
    url: text('url').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    durationMs: integer('duration_ms'),
    speakerName: text('speaker_name'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().default('published'),
    isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
    isCorrected: integer('is_corrected', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (t) => [
    unique('word_audios_file_unique').on(t.provider, t.providerFileId),
    index('word_audios_word_idx').on(t.wordId),
    index('word_audios_example_idx').on(t.exampleId),
  ],
);

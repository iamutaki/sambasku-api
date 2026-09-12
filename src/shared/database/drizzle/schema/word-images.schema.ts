import { boolean, index, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { users } from './users.schema';

// Gambar contoh per kata — referensi ke file di provider eksternal
// (ImageKit via ImageStoragePort). Provider-agnostic: kolom `provider`
// + `provider_file_id` supaya ganti provider tinggal ganti wrapper.
export const wordImages = pgTable(
  'word_images',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    provider: varchar('provider', { length: 50 }).notNull().default('imagekit'),
    providerFileId: varchar('provider_file_id', { length: 255 }).notNull(),
    url: varchar('url', { length: 1000 }).notNull(),
    altText: varchar('alt_text', { length: 500 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    unique('word_images_file_unique').on(t.provider, t.providerFileId),
    index('word_images_word_idx').on(t.wordId),
  ],
);

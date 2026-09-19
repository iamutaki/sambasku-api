import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { words } from './words.schema';

// Bookmark kata per user (16-api-bookmark.md): 1 user = 1 bookmark per kata,
// dijamin UNIQUE (user_id, word_id) - sekaligus penjaga race dua toggle
// bersamaan. Target word dengan FK LANGSUNG (preseden comments, BUKAN
// polymorphic seperti votes - bookmark hanya menarget kata).
// Bookmark mati = baris di-DELETE hard (preseden votes: baris user-state
// TIDAK pakai deleted_at) dan TIDAK diaudit (Section 18: vote/comment saja).
export const bookmarks = pgTable(
  'bookmarks',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookmarks_user_word_unique').on(t.userId, t.wordId),
    index('bookmarks_user_id_id_idx').on(t.userId, t.id),
  ],
);

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { words } from './words.schema';

// Bookmark kata per user (16-api-bookmark.md): 1 user = 1 bookmark per kata,
// dijamin UNIQUE (user_id, word_id) - sekaligus penjaga race dua toggle
// bersamaan. Target word dengan FK LANGSUNG (preseden comments, BUKAN
// polymorphic seperti votes - bookmark hanya menarget kata).
// Bookmark mati = baris di-DELETE hard (preseden votes: baris user-state
// TIDAK pakai deleted_at) dan TIDAK diaudit (Section 18: vote/comment saja).
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('bookmarks_user_word_unique').on(t.userId, t.wordId),
    index('bookmarks_user_id_id_idx').on(t.userId, t.id),
  ],
);

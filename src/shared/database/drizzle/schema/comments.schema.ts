import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { words } from './words.schema';

// Komentar pada lemma (09-api-comment.md). Terikat ke word (FK langsung).
// Post-moderation: create → published; admin takedown → taken_down;
// penulis hapus → deleted_by_author. Soft-delete hanya purge keras.
export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    // published | taken_down | deleted_by_author
    status: text('status').notNull().default('published'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    index('comments_word_status_idx').on(t.wordId, t.status, t.id),
    index('comments_status_idx').on(t.status, t.id),
    index('comments_user_status_id_idx').on(t.userId, t.status, t.id),
  ],
);

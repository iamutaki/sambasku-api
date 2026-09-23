import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Blocklist kata untuk filter otomatis create komentar
// (10-api-comment-blocklist.md). Soft-delete = nonaktif dari filter.
export const commentBlocklistWords = sqliteTable(
  'comment_blocklist_words',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    /** Disimpan lowercase trim */
    word: text('word').notNull(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    index('comment_blocklist_words_word_idx').on(t.word),
    index('comment_blocklist_words_id_idx').on(t.id),
  ],
);

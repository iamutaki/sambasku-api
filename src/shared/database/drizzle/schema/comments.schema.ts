import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { words } from './words.schema';

// Komentar pada lemma (09-api-comment.md). Terikat ke word (FK langsung,
// BUKAN polymorphic - keputusan 09) + pre-moderation penuh: komentar baru
// pending_review, tampil publik HANYA setelah approve admin/root/reviewer
// (approval gate Section 22; TANPA is_verified/is_corrected - konten ringan).
export const comments = pgTable(
  'comments',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    // pending_review | published | rejected (kosakata konten Section 22,
    // bukan kosakata workflow contributions - komentar adalah konten)
    status: varchar('status', { length: 30 }).notNull().default('pending_review'),
    reviewedBy: varchar('reviewed_by', { length: 26 }).references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    index('comments_word_status_idx').on(t.wordId, t.status, t.id),
    index('comments_status_idx').on(t.status, t.id),
  ],
);

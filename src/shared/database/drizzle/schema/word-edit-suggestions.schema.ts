import { index, json, pgTable, timestamp, varchar, text } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { words } from './words.schema';

/** Usulan perubahan pada kata existing dari user (kontributor+).
 *  Diproses lewat moderasi admin (approve/reject/correct) - lihat
 *  docs/api/17-api-suggest-edit-word.md.
 *
 *  proposed_changes: JSON sesuai struktur di doc 17.
 *  status: 'pending' | 'approved' | 'rejected' | 'corrected'
 */
export const wordEditSuggestions = pgTable(
  'word_edit_suggestions',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    proposedChanges: json('proposed_changes').notNull(),
    reason: text('reason').notNull(),
    // typo | inaccurate_definition | missing_example | missing_relation | image_issue | other
    reasonCode: varchar('reason_code', { length: 40 }).notNull().default('other'),
    status: varchar('status', { length: 30 })
      .notNull()
      .default('pending'),
    reviewedBy: varchar('reviewed_by', { length: 26 }).references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    reviewComment: text('review_comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    index('suggestions_word_status_idx').on(t.wordId, t.status),
    index('suggestions_user_created_idx').on(t.userId, t.createdAt),
    index('suggestions_status_created_idx').on(t.status, t.createdAt),
    index('suggestions_reason_code_idx').on(t.reasonCode),
  ],
);

/** Tipe status usulan */ export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'corrected';
/** Tipe aksi perubahan */ export type ChangeAction = 'update' | 'add' | 'delete';
/** Tipe entitas yang berubah di riwayat */ export type ChangeEntityType = 'word' | 'meaning' | 'translation' | 'example' | 'category';

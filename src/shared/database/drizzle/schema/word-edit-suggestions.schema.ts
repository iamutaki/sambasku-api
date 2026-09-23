import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
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
export const wordEditSuggestions = sqliteTable(
  'word_edit_suggestions',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    proposedChanges: text('proposed_changes', { mode: 'json' }).notNull(),
    reason: text('reason').notNull(),
    // typo | inaccurate_definition | missing_example | missing_relation | image_issue | other
    reasonCode: text('reason_code').notNull().default('other'),
    status: text('status')
      .notNull()
      .default('pending'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    reviewComment: text('review_comment'),
    // Terisi hanya jika usulan langsung menimpa kata yang belum terverifikasi.
    // Approve kemudian hanya menandai terverifikasi. Reject mengembalikan snapshot ini.
    baselineSnapshot: text('baseline_snapshot', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
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

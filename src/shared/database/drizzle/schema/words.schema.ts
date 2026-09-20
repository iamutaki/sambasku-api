import { boolean, index, pgTable, timestamp, varchar, text } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { languages } from './languages.schema';
import { users } from './users.schema';

// 'draft' | 'pending_review' | 'published' | 'rejected' - alur per role
// ada di resolvePublication (docs/api/03-api-kontribusi-verifikasi.md)
export const words = pgTable(
  'words',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    languageId: varchar('language_id', { length: 26 })
      .notNull()
      .references(() => languages.id),
    lemma: varchar('lemma', { length: 255 }).notNull(),
    notes: text('notes'),
    // word | idiom | peribahasa | ungkapan - jenis entri, bukan topik
    // (topik = categories). Mengaktifkan relasi has_component & filter search.
    wordType: varchar('word_type', { length: 30 }).notNull().default('word'),
    // Model publikasi (base-stack.md Section 22 - approval gate):
    // kontribusi contributor masuk antrean review (pending_review, tidak
    // tayang); pending_review/rejected hanya di-set sistem.
    status: varchar('status', { length: 30 }).notNull().default('draft'),
    // Flag verifikasi oleh tim verifikator (admin/root/reviewer).
    isVerified: boolean('is_verified').notNull().default(false),
    verifiedBy: varchar('verified_by', { length: 26 }).references(() => users.id),
    verifiedAt: timestamp('verified_at'),
    // true = isi pernah dikoreksi verifikator saat review (jejak pra-
    // koreksi di audit_logs.old_data, action 'correct')
    isCorrected: boolean('is_corrected').notNull().default(false),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    index('words_language_lemma_idx').on(t.languageId, t.lemma),
    // 18-api-list-words.md: keyset A-Z (lemma ASC, id ASC) - id wajib
    // tie-breaker karena lemma tidak unik
    index('words_lemma_id_idx').on(t.lemma, t.id),
  ],
);

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import type { UsageLabel } from '@/shared/constants/usage-labels';
import { languages } from './languages.schema';
import { users } from './users.schema';

// 'draft' | 'pending_review' | 'published' | 'rejected' - alur per role
// ada di resolvePublication (docs/api/03-api-kontribusi-verifikasi.md)
export const words = sqliteTable(
  'words',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    languageId: text('language_id')
      .notNull()
      .references(() => languages.id),
    lemma: text('lemma').notNull(),
    // true = koma di lemma memang literal (bukan multi-kata) → keluar antrean Pemisahan
    lemmaAllowsComma: integer('lemma_allows_comma', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    // word | idiom | peribahasa | ungkapan - jenis entri, bukan topik
    // (topik = categories). Mengaktifkan relasi has_component & filter search.
    wordType: text('word_type').notNull().default('word'),
    // Register + peringatan konten (closed enum JSON array). Bukan kategori
    // topik — lihat shared/constants/usage-labels.ts.
    usageLabels: text('usage_labels', { mode: 'json' })
      .$type<UsageLabel[]>()
      .notNull()
      .default([]),
    // Model publikasi (base-stack.md Section 22 - approval gate):
    // kontribusi contributor masuk antrean review (pending_review, tidak
    // tayang); pending_review/rejected hanya di-set sistem.
    status: text('status').notNull().default('draft'),
    // Flag verifikasi oleh tim verifikator (admin/root/reviewer).
    isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
    verifiedBy: text('verified_by').references(() => users.id),
    verifiedAt: integer('verified_at', { mode: 'timestamp' }),
    // true = isi pernah dikoreksi verifikator saat review (jejak pra-
    // koreksi di audit_logs.old_data, action 'correct')
    isCorrected: integer('is_corrected', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by').references(() => users.id),
    updatedBy: text('updated_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
    // Jejak takedown (pernah tayang, lalu ditarik). Null saat bukan taken_down
    // dan dikosongkan lagi saat pulihkan.
    takedownReasonCode: text('takedown_reason_code'),
    takedownNote: text('takedown_note'),
    takenDownBy: text('taken_down_by').references(() => users.id),
    takenDownAt: integer('taken_down_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('words_language_lemma_idx').on(t.languageId, t.lemma),
    // 18-api-list-words.md: keyset A-Z (lower(lemma), id).
    // + lower() dipin supaya urutan identik di SEMUA DB -
    // collation column mengikuti locale DB (staging = C: "Zebra" < "apam",
    // dev = en_US: interleaving) → list A-Z tampak tidak alfabetis.
    index('words_lemma_az_idx').on(sql`lower(${t.lemma})`, t.id),
    // Feed beranda: published terbaru (verified_at DESC, id DESC).
    index('words_published_recent_idx').on(t.status, t.verifiedAt, t.id),
  ],
);

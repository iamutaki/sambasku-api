import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { wordClasses } from './word-classes.schema';
import { users } from './users.schema';

// 04-api-sinonim-inline.md: self-referencing FK - makna hasil SALINAN ketika
// sinonim dibuat inline (inherit makna induk). Terisi = masih "mengikuti"
// induknya; NULL = makna mandiri / sudah di-override (provenance utk fitur
// reset ke induk & re-sync di masa depan).
export const meanings = sqliteTable(
  'meanings',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    wordClassId: text('word_class_id').references(() => wordClasses.id),
    // Self-referencing FK (makna → makna induk): pakai AnySQLiteColumn untuk
    // memutus siklus tipe (meja belum selesai didefinisikan saat kolom dibuat)
    inheritedFromMeaningId: text('inherited_from_meaning_id').references(
      (): AnySQLiteColumn => meanings.id,
    ),
    definition: text('definition').notNull(),
    // 17-api-usul-definisi.md: false = placeholder "-"" (kontributor belum
    // tahu definisi Indonesia) - CTA "Bantu definisi" di client diturunkan
    // dari flag ini, bukan dari teks "-".
    isHaveDefinition: integer('is_have_definition', { mode: 'boolean' }).notNull().default(true),
    // false = kontributor sengaja tidak mengisi padanan kata Indonesia
    // (definisi uraian sudah ada; padanan bisa dilengkapi nanti).
    isHaveTranslation: integer('is_have_translation', { mode: 'boolean' }).notNull().default(true),
    orderIndex: integer('order_index').notNull().default(0),
    notes: text('notes'),
    // Gerbang publikasi anak (17-api-usul-definisi.md, preseden examples):
    // makna kontribusi contributor pada kata existing masuk antrean.
    status: text('status').notNull().default('published'),
    isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
    isCorrected: integer('is_corrected', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by').references(() => users.id),
    updatedBy: text('updated_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    index('meanings_word_order_idx').on(t.wordId, t.orderIndex),
    index('meanings_inherited_from_idx').on(t.inheritedFromMeaningId),
    index('meanings_word_status_idx').on(t.wordId, t.status),
  ],
);

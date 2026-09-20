import { boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { wordClasses } from './word-classes.schema';
import { users } from './users.schema';

// 04-api-sinonim-inline.md: self-referencing FK - makna hasil SALINAN ketika
// sinonim dibuat inline (inherit makna induk). Terisi = masih "mengikuti"
// induknya; NULL = makna mandiri / sudah di-override (provenance utk fitur
// reset ke induk & re-sync di masa depan).
export const meanings = pgTable(
  'meanings',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    wordClassId: varchar('word_class_id', { length: 26 }).references(() => wordClasses.id),
    // Self-referencing FK (makna → makna induk): pakai AnyPgColumn untuk
    // memutus siklus tipe (meja belum selesai didefinisikan saat kolom dibuat)
    inheritedFromMeaningId: varchar('inherited_from_meaning_id', { length: 26 }).references(
      (): AnyPgColumn => meanings.id,
    ),
    definition: text('definition').notNull(),
    // 17-api-usul-definisi.md: false = placeholder "-"" (kontributor belum
    // tahu definisi Indonesia) - CTA "Bantu definisi" di client diturunkan
    // dari flag ini, bukan dari teks "-".
    isHaveDefinition: boolean('is_have_definition').notNull().default(true),
    // false = kontributor sengaja tidak mengisi padanan kata Indonesia
    // (definisi uraian sudah ada; padanan bisa dilengkapi nanti).
    isHaveTranslation: boolean('is_have_translation').notNull().default(true),
    orderIndex: integer('order_index').notNull().default(0),
    notes: text('notes'),
    // Gerbang publikasi anak (17-api-usul-definisi.md, preseden examples):
    // makna kontribusi contributor pada kata existing masuk antrean.
    status: varchar('status', { length: 30 }).notNull().default('published'),
    isVerified: boolean('is_verified').notNull().default(false),
    isCorrected: boolean('is_corrected').notNull().default(false),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    index('meanings_word_order_idx').on(t.wordId, t.orderIndex),
    index('meanings_inherited_from_idx').on(t.inheritedFromMeaningId),
    index('meanings_word_status_idx').on(t.wordId, t.status),
  ],
);

import { index, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { dialects } from './dialects.schema';
import { users } from './users.schema';

// Bentuk surface kata — variasi bentuk TANPA entri kamus sendiri
// (mis. "memakan" milik entri "makan"). Punya makna sendiri → entri words
// + lexical_relations, bukan tabel ini (lihat 01-api-tambah-kata.md).
export const wordVariants = pgTable(
  'word_variants',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    form: varchar('form', { length: 255 }).notNull(),
    // inflection | derivation | alternative | reduplication
    variantType: varchar('variant_type', { length: 50 }).notNull().default('alternative'),
    // prefix | suffix | circumfix | reduplication (nullable — bentuk tanpa afiks)
    affixType: varchar('affix_type', { length: 30 }),
    affixValue: varchar('affix_value', { length: 50 }),
    dialectId: varchar('dialect_id', { length: 26 }).references(() => dialects.id),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    unique('word_variants_unique').on(t.wordId, t.form, t.dialectId),
    index('word_variants_word_idx').on(t.wordId),
  ],
);

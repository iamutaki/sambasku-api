import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { dialects } from './dialects.schema';
import { users } from './users.schema';

// Bentuk surface kata - variasi bentuk TANPA entri kamus sendiri
// (mis. "memakan" milik entri "makan"). Punya makna sendiri → entri words
// + lexical_relations, bukan tabel ini (lihat 01-api-tambah-kata.md).
export const wordVariants = sqliteTable(
  'word_variants',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    form: text('form').notNull(),
    // inflection | derivation | alternative | reduplication
    variantType: text('variant_type').notNull().default('alternative'),
    // prefix | suffix | circumfix | reduplication (nullable - bentuk tanpa afiks)
    affixType: text('affix_type'),
    affixValue: text('affix_value'),
    dialectId: text('dialect_id').references(() => dialects.id),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    updatedBy: text('updated_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    unique('word_variants_unique').on(t.wordId, t.form, t.dialectId),
    index('word_variants_word_idx').on(t.wordId),
  ],
);

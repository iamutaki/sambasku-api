import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { words } from './words.schema';
import { categories } from './categories.schema';

// Junction table - composite PK, tanpa kolom tambahan (Section 19)
export const wordCategories = sqliteTable(
  'word_categories',
  {
    wordId: text('word_id')
      .notNull()
      .references(() => words.id),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.categoryId] })],
);

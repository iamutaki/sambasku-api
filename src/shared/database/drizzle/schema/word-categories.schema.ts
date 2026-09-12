import { primaryKey, pgTable, varchar } from 'drizzle-orm/pg-core';
import { words } from './words.schema';
import { categories } from './categories.schema';

// Junction table — composite PK, tanpa kolom tambahan (Section 19)
export const wordCategories = pgTable(
  'word_categories',
  {
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    categoryId: varchar('category_id', { length: 26 })
      .notNull()
      .references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.categoryId] })],
);

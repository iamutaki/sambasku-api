import { boolean, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { languages } from './languages.schema';

export const dialects = pgTable(
  'dialects',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    languageId: varchar('language_id', { length: 26 })
      .notNull()
      .references(() => languages.id),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [unique('dialects_language_code_unique').on(t.languageId, t.code)],
);

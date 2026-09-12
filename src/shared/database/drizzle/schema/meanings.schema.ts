import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { wordClasses } from './word-classes.schema';
import { users } from './users.schema';

export const meanings = pgTable(
  'meanings',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    wordId: varchar('word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    wordClassId: varchar('word_class_id', { length: 26 }).references(() => wordClasses.id),
    definition: text('definition').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [index('meanings_word_order_idx').on(t.wordId, t.orderIndex)],
);

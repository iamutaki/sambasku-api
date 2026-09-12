import { index, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { users } from './users.schema';

export const lexicalRelations = pgTable(
  'lexical_relations',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    sourceWordId: varchar('source_word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    targetWordId: varchar('target_word_id', { length: 26 })
      .notNull()
      .references(() => words.id),
    // synonym | antonym | dst
    relationType: varchar('relation_type', { length: 50 }).notNull(),
    notes: text('notes'),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('lexical_relations_unique').on(t.sourceWordId, t.targetWordId, t.relationType),
    // query invers "muncul dalam" (mis. komponen → peribahasa pemakainya)
    index('lexical_relations_target_idx').on(t.targetWordId),
  ],
);

import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { words } from './words.schema';
import { users } from './users.schema';

export const lexicalRelations = sqliteTable(
  'lexical_relations',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    sourceWordId: text('source_word_id')
      .notNull()
      .references(() => words.id),
    targetWordId: text('target_word_id')
      .notNull()
      .references(() => words.id),
    // synonym | antonym | dst
    relationType: text('relation_type').notNull(),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  deletedBy: text('deleted_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    unique('lexical_relations_unique').on(t.sourceWordId, t.targetWordId, t.relationType),
    // query invers "muncul dalam" (mis. komponen → peribahasa pemakainya)
    index('lexical_relations_target_idx').on(t.targetWordId),
  ],
);

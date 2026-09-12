import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export const contributions = pgTable(
  'contributions',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    // 'word' | 'meaning' | dst
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 26 }).notNull(),
    // 'create' | 'update' | 'delete' | 'publish' | dst
    action: varchar('action', { length: 50 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('contributions_user_created_idx').on(t.userId, t.createdAt),
    index('contributions_entity_idx').on(t.entityType, t.entityId),
  ],
);

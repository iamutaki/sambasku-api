import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';

export const categories = pgTable('categories', {
  id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
  parentId: varchar('parent_id', { length: 26 }),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at'),
});

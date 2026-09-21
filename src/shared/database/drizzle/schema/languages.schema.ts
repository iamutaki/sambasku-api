import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export const languages = sqliteTable('languages', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  nativeName: text('native_name'),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
});

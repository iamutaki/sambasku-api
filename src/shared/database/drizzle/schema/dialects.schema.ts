import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { languages } from './languages.schema';
import { users } from './users.schema';

export const dialects = sqliteTable(
  'dialects',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    languageId: text('language_id')
      .notNull()
      .references(() => languages.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    /** Satu default per language (biasanya code=umum) - UI auto-select. */
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    unique('dialects_language_code_unique').on(t.languageId, t.code),
    uniqueIndex('dialects_one_default_per_language_idx')
      .on(t.languageId)
      .where(sql`is_default = 1 and deleted_at is null`),
  ],
);

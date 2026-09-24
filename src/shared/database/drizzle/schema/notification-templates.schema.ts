import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

/** Template notifikasi campaign (admin). Soft-delete via deleted_at. */
export const notificationTemplates = sqliteTable(
  'notification_templates',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    name: text('name').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** word | contribution | suggestion | url | none */
    deepLinkKind: text('deep_link_kind').notNull().default('none'),
    deepLinkValue: text('deep_link_value'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('notification_templates_active_created_at_idx')
      .on(t.createdAt)
      .where(sql`deleted_at is null`),
  ],
);

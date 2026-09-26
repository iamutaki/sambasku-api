import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users.schema';

/**
 * Key-value runtime config (OAuth enforcement, versi legal aktif, dst.).
 * Diubah dari console tanpa redeploy - lihat third-party API security plan.
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: text('updated_by').references(() => users.id),
});

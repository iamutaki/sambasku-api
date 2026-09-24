import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { notificationTemplates } from './notification-templates.schema';

/**
 * Campaign notifikasi admin. Snapshot title/body/deeplink disimpan di sini
 * agar edit template tidak mengubah campaign yang sudah/ sedang dikirim.
 */
export const notificationCampaigns = sqliteTable(
  'notification_campaigns',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    templateId: text('template_id').references(() => notificationTemplates.id),
    /** Snapshot copy saat draft/send. */
    title: text('title').notNull(),
    body: text('body').notNull(),
    deepLinkKind: text('deep_link_kind').notNull().default('none'),
    deepLinkValue: text('deep_link_value'),
    /** all | selected */
    audienceType: text('audience_type').notNull(),
    /**
     * draft | scheduled | sending | completed | failed | cancelled
     */
    status: text('status').notNull().default('draft'),
    sendAt: integer('send_at', { mode: 'timestamp' }),
    targetedUsers: integer('targeted_users').notNull().default(0),
    pushSuccess: integer('push_success').notNull().default(0),
    pushFailed: integer('push_failed').notNull().default(0),
    inboxWritten: integer('inbox_written').notNull().default(0),
    /** Cursor untuk batch inbox audience=all (user_id terakhir yang diproses). */
    inboxCursor: text('inbox_cursor'),
    /** true setelah FCM topic send sukses (audience=all). */
    topicSent: integer('topic_sent', { mode: 'boolean' }).notNull().default(false),
    lastError: text('last_error'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('notification_campaigns_status_send_at_idx').on(t.status, t.sendAt),
    index('notification_campaigns_created_at_idx').on(t.createdAt),
  ],
);

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';
import { notificationCampaigns } from './notification-campaigns.schema';

/** Penerima campaign audience=selected. */
export const notificationCampaignRecipients = sqliteTable(
  'notification_campaign_recipients',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => notificationCampaigns.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    /** pending | sent | failed | skipped_no_token */
    status: text('status').notNull().default('pending'),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('notification_campaign_recipients_campaign_user_unique').on(
      t.campaignId,
      t.userId,
    ),
    index('notification_campaign_recipients_pending_idx').on(t.campaignId, t.status),
  ],
);

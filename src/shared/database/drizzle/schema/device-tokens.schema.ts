import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// FCM device tokens (multi-device per user). Satu baris = satu perangkat
// fisik (`udid` unique). Soft-delete via deleted_at saat revoke/logout.
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    udid: text('udid').notNull(),
    fcmToken: text('fcm_token').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('device_tokens_udid_unique').on(t.udid),
    // Satu FCM token aktif hanya di satu device — cegah double push.
    uniqueIndex('device_tokens_active_fcm_token_idx')
      .on(t.fcmToken)
      .where(sql`deleted_at is null`),
    index('device_tokens_active_user_id_idx')
      .on(t.userId)
      .where(sql`deleted_at is null`),
  ],
);

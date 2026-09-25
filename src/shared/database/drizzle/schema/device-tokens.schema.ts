import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// FCM device tokens (multi-device per user). Satu baris = satu perangkat
// fisik (`udid` unique). Soft-delete via deleted_at saat revoke/logout.
export const deviceTokens = sqliteTable(
  'device_tokens',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    udid: text('udid').notNull(),
    fcmToken: text('fcm_token').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('device_tokens_udid_unique').on(t.udid),
    // Satu FCM token aktif hanya di satu device - cegah double push.
    uniqueIndex('device_tokens_active_fcm_token_idx')
      .on(t.fcmToken)
      .where(sql`deleted_at is null`),
    index('device_tokens_active_user_id_idx')
      .on(t.userId)
      .where(sql`deleted_at is null`),
  ],
);

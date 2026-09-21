import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Inbox in-app status usulan (23-api-notifications.md). Satu baris per
// keputusan review (unique user + target). Bukan push FCM: device_tokens
// tetap jalur push terpisah. read_at menandai sudah dibaca. Tidak diaudit
// (baris user-state, preseden bookmark).
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    targetKind: text('target_kind').notNull(),
    targetId: text('target_id').notNull(),
    readAt: integer('read_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('notifications_user_target_unique').on(t.userId, t.targetKind, t.targetId),
    index('notifications_user_id_id_idx').on(t.userId, t.id),
    index('notifications_user_unread_idx').on(t.userId).where(sql`read_at is null`),
  ],
);

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Inbox in-app status usulan (23-api-notifications.md). Satu baris per
// keputusan review (unique user + target). Bukan push FCM: device_tokens
// tetap jalur push terpisah. read_at menandai sudah dibaca. Tidak diaudit
// (baris user-state, preseden bookmark).
export const notifications = pgTable(
  'notifications',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    type: varchar('type', { length: 50 }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    targetKind: varchar('target_kind', { length: 20 }).notNull(),
    targetId: varchar('target_id', { length: 26 }).notNull(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_user_target_unique').on(t.userId, t.targetKind, t.targetId),
    index('notifications_user_id_id_idx').on(t.userId, t.id),
    index('notifications_user_unread_idx').on(t.userId).where(sql`read_at is null`),
  ],
);

import { index, json, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Jejak audit setiap mutasi data — base-stack.md Section 21.
// old_data/new_data TIDAK BOLEH berisi password/token/kredensial.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 }).references(() => users.id),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 26 }).notNull(),
    oldData: json('old_data'),
    newData: json('new_data'),
    requestId: varchar('request_id', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_created_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_logs_user_created_idx').on(t.userId, t.createdAt),
    index('audit_logs_request_id_idx').on(t.requestId),
  ],
);

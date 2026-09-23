import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Jejak audit setiap mutasi data - base-stack.md Section 21.
// old_data/new_data TIDAK BOLEH berisi password/token/kredensial.
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    oldData: text('old_data', { mode: 'json' }),
    newData: text('new_data', { mode: 'json' }),
    requestId: text('request_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    sourceContributionId: text('source_contribution_id'),
  },
  (t) => [
    index('audit_logs_entity_created_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_logs_user_created_idx').on(t.userId, t.createdAt),
    index('audit_logs_request_id_idx').on(t.requestId),
    index('audit_logs_source_contribution_idx').on(t.sourceContributionId),
  ],
);

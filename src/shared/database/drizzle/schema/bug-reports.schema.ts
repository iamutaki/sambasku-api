import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export type BugReportImageRow = {
  url: string;
  provider_file_id: string;
};

/** Laporan masalah tamu + login (30-api-bug-reports.md). */
export const bugReports = sqliteTable(
  'bug_reports',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id').references(() => users.id),
    deviceId: text('device_id'),
    description: text('description').notNull(),
    images: text('images', { mode: 'json' }).$type<BugReportImageRow[]>().notNull(),
    appVersion: text('app_version'),
    platform: text('platform'),
    status: text('status').notNull().default('open'),
    resolutionNote: text('resolution_note'),
    resolvedBy: text('resolved_by').references(() => users.id),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    createdBy: text('created_by').references(() => users.id),
    updatedBy: text('updated_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    index('bug_reports_status_id_idx').on(t.status, t.id),
    index('bug_reports_user_id_idx').on(t.userId),
    index('bug_reports_device_id_idx').on(t.deviceId),
  ],
);

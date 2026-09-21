import { index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export type BugReportImageRow = {
  url: string;
  provider_file_id: string;
};

/** Laporan masalah tamu + login (30-api-bug-reports.md). */
export const bugReports = pgTable(
  'bug_reports',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 }).references(() => users.id),
    deviceId: varchar('device_id', { length: 64 }),
    description: text('description').notNull(),
    images: jsonb('images').$type<BugReportImageRow[]>().notNull(),
    appVersion: varchar('app_version', { length: 20 }),
    platform: varchar('platform', { length: 10 }),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    resolutionNote: text('resolution_note'),
    resolvedBy: varchar('resolved_by', { length: 26 }).references(() => users.id),
    resolvedAt: timestamp('resolved_at'),
    createdBy: varchar('created_by', { length: 26 }).references(() => users.id),
    updatedBy: varchar('updated_by', { length: 26 }).references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    index('bug_reports_status_id_idx').on(t.status, t.id),
    index('bug_reports_user_id_idx').on(t.userId),
    index('bug_reports_device_id_idx').on(t.deviceId),
  ],
);

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export type VerifierApplicationSocialLink = {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'website';
  username: string;
  screenshot: { url: string; provider_file_id: string };
};

/** Pengajuan contributor menjadi reviewer (20-api-verifier-application.md). */
export const verifierApplications = sqliteTable(
  'verifier_applications',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    socialLinks: text('social_links', { mode: 'json' }).$type<VerifierApplicationSocialLink[]>().notNull(),
    status: text('status').notNull().default('pending'),
    adminComment: text('admin_comment'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('verifier_applications_user_id_unique').on(t.userId),
    index('verifier_applications_status_id_idx').on(t.status, t.id),
  ],
);

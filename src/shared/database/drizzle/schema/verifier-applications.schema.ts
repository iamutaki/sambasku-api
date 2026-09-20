import { index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

export type VerifierApplicationSocialLink = {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'website';
  url: string;
};

/** Pengajuan contributor menjadi reviewer (20-api-verifier-application.md). */
export const verifierApplications = pgTable(
  'verifier_applications',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    phone: varchar('phone', { length: 20 }).notNull(),
    address: text('address').notNull(),
    socialLinks: jsonb('social_links').$type<VerifierApplicationSocialLink[]>().notNull(),
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    adminComment: text('admin_comment'),
    reviewedBy: varchar('reviewed_by', { length: 26 }).references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    uniqueIndex('verifier_applications_user_id_unique').on(t.userId),
    index('verifier_applications_status_id_idx').on(t.status, t.id),
  ],
);

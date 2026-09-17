import { index, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Identitas eksternal untuk auth via provider (base-stack.md Section 23):
// satunya tempat menautkan akun user ke Google (nanti: GitHub, Apple, dst).
// Identitas stabil = provider_user_id (Google `sub`) - email provider bisa
// berubah, kolom email_at_provider hanyalah snapshot saat penautan.
// User OAuth-only tidak punya password (users.password_hash nullable).
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    // google | github | apple | dst
    provider: varchar('provider', { length: 30 }).notNull(),
    // ID stabil dari provider (Google `sub`) - BUKAN email
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    emailAtProvider: varchar('email_at_provider', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 26 }).references(() => users.id),
  },
  (t) => [
    unique('auth_identities_provider_uid_unique').on(t.provider, t.providerUserId),
    index('auth_identities_user_idx').on(t.userId),
  ],
);

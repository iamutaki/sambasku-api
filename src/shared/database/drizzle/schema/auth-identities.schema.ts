import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Identitas eksternal untuk auth via provider (base-stack.md Section 23):
// satunya tempat menautkan akun user ke Google (nanti: GitHub, Apple, dst).
// Identitas stabil = provider_user_id (Google `sub`) - email provider bisa
// berubah, kolom email_at_provider hanyalah snapshot saat penautan.
// User OAuth-only tidak punya password (users.password_hash nullable).
export const authIdentities = sqliteTable(
  'auth_identities',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    // google | github | apple | dst
    provider: text('provider').notNull(),
    // ID stabil dari provider (Google `sub`) - BUKAN email
    providerUserId: text('provider_user_id').notNull(),
    emailAtProvider: text('email_at_provider'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    unique('auth_identities_provider_uid_unique').on(t.provider, t.providerUserId),
    index('auth_identities_user_idx').on(t.userId),
  ],
);

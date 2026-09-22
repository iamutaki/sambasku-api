import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';

// Sesuai tabel `users` di docs/dbdiagram.dbml
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    // Wire register pakai field `name` - disimpan di username (login by email)
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    // Digit internasional tanpa '+', mis. 62899…; NULL kalau user skip.
    phone: text('phone'),
    // NULLABLE (Section 23): user OAuth-only tidak punya password.
    passwordHash: text('password_hash'),
    // administrator | editor | reviewer | contributor
    role: text('role').notNull().default('contributor'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    // Avatar publik (GitHub sambasku-images). Null = belum set.
    avatarUrl: text('avatar_url'),
    avatarProvider: text('avatar_provider'),
    avatarProviderFileId: text('avatar_provider_file_id'),
    avatarSha: text('avatar_sha'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('users_phone_unique').on(t.phone).where(sql`phone is not null`),
  ],
);

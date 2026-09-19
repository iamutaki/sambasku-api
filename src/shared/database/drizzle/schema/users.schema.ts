import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';

// Sesuai tabel `users` di docs/dbdiagram.dbml
export const users = pgTable('users', {
  id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
  // Wire register pakai field `name` - disimpan di username (login by email)
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  // Digit internasional tanpa '+', mis. 62899…; NULL kalau user skip. Unique partial di migration.
  phone: varchar('phone', { length: 20 }),
  // NULLABLE (Section 23): user OAuth-only tidak punya password - lahir dari
  // login via provider, bukan register. Login password wajib menolak NULL.
  passwordHash: varchar('password_hash', { length: 255 }),
  // administrator | editor | reviewer | contributor
  role: varchar('role', { length: 50 }).notNull().default('contributor'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at'),
  deletedAt: timestamp('deleted_at'), // soft delete - tidak boleh bisa login lagi
});

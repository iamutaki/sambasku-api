import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';

// Sesuai tabel `users` di docs/dbdiagram.dbml
export const users = pgTable('users', {
  id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
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

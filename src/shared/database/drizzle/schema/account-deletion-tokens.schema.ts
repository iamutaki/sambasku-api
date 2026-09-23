import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// Kode sekali pakai untuk menghapus akun dari situs (tanpa sesi aplikasi).
// Hash saja yang disimpan, sama seperti password_reset_tokens.
export const accountDeletionTokens = sqliteTable(
  'account_deletion_tokens',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    isUsed: integer('is_used', { mode: 'boolean' }).notNull().default(false),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index('account_deletion_tokens_user_id_idx').on(t.userId)],
);

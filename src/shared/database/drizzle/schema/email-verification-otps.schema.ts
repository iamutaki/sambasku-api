import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// OTP verifikasi email (AUTH_EMAIL_OTP.md). Satu baris aktif per user.
export const emailVerificationOtps = sqliteTable(
  'email_verification_otps',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    codeHash: text('code_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    unique('email_verification_otps_user_unique').on(t.userId),
    index('email_verification_otps_user_idx').on(t.userId),
  ],
);

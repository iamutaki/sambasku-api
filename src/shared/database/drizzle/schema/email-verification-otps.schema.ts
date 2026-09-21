import { index, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { generateId } from '@/shared/utils/ulid';
import { users } from './users.schema';

// OTP verifikasi email (AUTH_EMAIL_OTP.md). Satu baris aktif per user.
export const emailVerificationOtps = pgTable(
  'email_verification_otps',
  {
    id: varchar('id', { length: 26 }).primaryKey().$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    codeHash: varchar('code_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('email_verification_otps_user_unique').on(t.userId),
    index('email_verification_otps_user_idx').on(t.userId),
  ],
);

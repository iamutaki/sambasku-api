import { and, eq, gt, sql } from 'drizzle-orm';
import { emailVerificationOtps } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { EmailVerificationOtp } from '../domain/entities/email-verification-otp.entity';
import type {
  EmailVerificationOtpRepository,
  NewEmailVerificationOtp,
} from '../domain/repositories/email-verification-otp.repository';

function toEntity(row: typeof emailVerificationOtps.$inferSelect): EmailVerificationOtp {
  return {
    id: row.id,
    userId: row.userId,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
  };
}

export class EmailVerificationOtpRepositoryImpl implements EmailVerificationOtpRepository {
  constructor(private readonly db: AppDatabase) {}

  async replaceForUser(input: NewEmailVerificationOtp): Promise<EmailVerificationOtp> {
    await this.db.delete(emailVerificationOtps).where(eq(emailVerificationOtps.userId, input.userId));
    const [row] = await this.db.insert(emailVerificationOtps).values(input).returning();
    return toEntity(row);
  }

  async findByUserId(userId: string): Promise<EmailVerificationOtp | null> {
    const [row] = await this.db
      .select()
      .from(emailVerificationOtps)
      .where(eq(emailVerificationOtps.userId, userId))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async incrementAttempts(id: string): Promise<number> {
    const [row] = await this.db
      .update(emailVerificationOtps)
      .set({ attemptCount: sql`${emailVerificationOtps.attemptCount} + 1` })
      .where(eq(emailVerificationOtps.id, id))
      .returning();
    return row?.attemptCount ?? 0;
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.delete(emailVerificationOtps).where(eq(emailVerificationOtps.userId, userId));
  }

  async consumeIfMatch(userId: string, codeHash: string): Promise<boolean> {
    const rows = await this.db
      .delete(emailVerificationOtps)
      .where(
        and(
          eq(emailVerificationOtps.userId, userId),
          eq(emailVerificationOtps.codeHash, codeHash),
          gt(emailVerificationOtps.expiresAt, new Date()),
        ),
      )
      .returning({ id: emailVerificationOtps.id });
    return rows.length > 0;
  }
}

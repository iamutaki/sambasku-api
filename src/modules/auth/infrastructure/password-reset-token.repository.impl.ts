import { and, eq, gt } from 'drizzle-orm';
import { passwordResetTokens } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type {
  NewPasswordResetToken,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from '../domain/repositories/password-reset-token.repository';

export class PasswordResetTokenRepositoryImpl implements PasswordResetTokenRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(token: NewPasswordResetToken): Promise<PasswordResetTokenRecord> {
    const [row] = await this.db.insert(passwordResetTokens).values(token).returning();
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      isUsed: row.isUsed,
      expiresAt: row.expiresAt,
    };
  }

  async findByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return row
      ? {
          id: row.id,
          userId: row.userId,
          tokenHash: row.tokenHash,
          isUsed: row.isUsed,
          expiresAt: row.expiresAt,
        }
      : null;
  }

  async consume(tokenHash: string): Promise<boolean> {
    // Atomic check-and-set: hanya berhasil kalau belum dipakai dan belum kadaluarsa
    const consumed = await this.db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          eq(passwordResetTokens.isUsed, false),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning({ id: passwordResetTokens.id });
    return consumed.length > 0;
  }

  async invalidateUnusedForUser(userId: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(and(eq(passwordResetTokens.userId, userId), eq(passwordResetTokens.isUsed, false)));
  }
}

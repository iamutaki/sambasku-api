import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { passwordResetTokens } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type {
  NewPasswordResetToken,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from '../domain/repositories/password-reset-token.repository';

export class PasswordResetTokenRepositoryImpl implements PasswordResetTokenRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

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
    // Atomic check-and-set: hanya berhasil kalau token belum pernah dipakai
    const consumed = await this.db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), eq(passwordResetTokens.isUsed, false)))
      .returning({ id: passwordResetTokens.id });
    return consumed.length > 0;
  }
}

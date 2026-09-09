import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { refreshTokens } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../domain/repositories/refresh-token.repository';

export class RefreshTokenRepositoryImpl implements RefreshTokenRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const [row] = await this.db.insert(refreshTokens).values(token).returning();
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      isRevoked: row.isRevoked,
      expiresAt: row.expiresAt,
    };
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row
      ? {
          id: row.id,
          userId: row.userId,
          tokenHash: row.tokenHash,
          isRevoked: row.isRevoked,
          expiresAt: row.expiresAt,
        }
      : null;
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.isRevoked, false)));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.isRevoked, false)));
  }
}

import { and, eq } from 'drizzle-orm';
import { refreshTokens } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../domain/repositories/refresh-token.repository';

export class RefreshTokenRepositoryImpl implements RefreshTokenRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const [row] = await this.db.insert(refreshTokens).values(token).returning();
    return mapRow(row);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row ? mapRow(row) : null;
  }

  async markRotated(tokenHash: string): Promise<boolean> {
    const updated = await this.db
      .update(refreshTokens)
      .set({ isRevoked: true, rotatedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.isRevoked, false)))
      .returning({ id: refreshTokens.id });
    return updated.length > 0;
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    // rotatedAt dikosongkan: cabut paksa, bukan rotasi. Grace tidak berlaku.
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true, rotatedAt: null })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true, rotatedAt: null })
      .where(eq(refreshTokens.userId, userId));
  }
}

function mapRow(row: {
  id: string;
  userId: string;
  tokenHash: string;
  clientId: string | null;
  isRevoked: boolean;
  rotatedAt: Date | null;
  expiresAt: Date;
}): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    clientId: row.clientId,
    isRevoked: row.isRevoked,
    rotatedAt: row.rotatedAt,
    expiresAt: row.expiresAt,
  };
}

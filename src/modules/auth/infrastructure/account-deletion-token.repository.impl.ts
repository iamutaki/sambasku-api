import { and, eq, gt } from 'drizzle-orm';
import { accountDeletionTokens } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type {
  AccountDeletionTokenRecord,
  AccountDeletionTokenRepository,
  NewAccountDeletionToken,
} from '../domain/repositories/account-deletion-token.repository';

export class AccountDeletionTokenRepositoryImpl implements AccountDeletionTokenRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(token: NewAccountDeletionToken): Promise<AccountDeletionTokenRecord> {
    const [row] = await this.db.insert(accountDeletionTokens).values(token).returning();
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      isUsed: row.isUsed,
      expiresAt: row.expiresAt,
    };
  }

  async findByHash(tokenHash: string): Promise<AccountDeletionTokenRecord | null> {
    const [row] = await this.db
      .select()
      .from(accountDeletionTokens)
      .where(eq(accountDeletionTokens.tokenHash, tokenHash))
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
    const consumed = await this.db
      .update(accountDeletionTokens)
      .set({ isUsed: true })
      .where(
        and(
          eq(accountDeletionTokens.tokenHash, tokenHash),
          eq(accountDeletionTokens.isUsed, false),
          gt(accountDeletionTokens.expiresAt, new Date()),
        ),
      )
      .returning({ id: accountDeletionTokens.id });
    return consumed.length > 0;
  }

  async invalidateUnusedForUser(userId: string): Promise<void> {
    await this.db
      .update(accountDeletionTokens)
      .set({ isUsed: true })
      .where(and(eq(accountDeletionTokens.userId, userId), eq(accountDeletionTokens.isUsed, false)));
  }
}

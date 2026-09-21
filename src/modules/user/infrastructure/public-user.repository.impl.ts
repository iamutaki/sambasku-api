import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { contributionReviews, contributions, users } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { PublicProfileStats, PublicUserRow } from '../domain/entities/public-profile.entity';
import type { PublicUserRepository } from '../domain/repositories/public-user.repository';

export class PublicUserRepositoryImpl implements PublicUserRepository {
  constructor(private readonly db: AppDatabase) {}

  async findPublicByUsername(username: string): Promise<PublicUserRow | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        joinedAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.username, username), isNull(users.deletedAt), eq(users.isActive, true)))
      .limit(1);

    return row ?? null;
  }

  async countApprovedContributions(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contributions)
      .where(
        and(
          eq(contributions.userId, userId),
          inArray(contributions.status, ['approved', 'corrected']),
          isNull(contributions.deletedAt),
        ),
      );
    return row?.count ?? 0;
  }

  async countVerificationsDone(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contributionReviews)
      .where(
        and(
          eq(contributionReviews.reviewerId, userId),
          ne(contributionReviews.status, 'pending'),
          isNull(contributionReviews.deletedAt),
        ),
      );
    return row?.count ?? 0;
  }

  async loadStats(userId: string): Promise<PublicProfileStats> {
    const [contributionsApproved, verificationsDone] = await Promise.all([
      this.countApprovedContributions(userId),
      this.countVerificationsDone(userId),
    ]);
    return { contributionsApproved, verificationsDone };
  }
}

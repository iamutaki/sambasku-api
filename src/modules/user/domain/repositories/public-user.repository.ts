import type {
  PublicActivityItem,
  PublicProfileStats,
  PublicUserRow,
} from '../entities/public-profile.entity';

export interface PublicUserRepository {
  /**
   * Lookup exact match. Null jika tidak ada, soft-deleted, atau
   * is_active = false. SELECT hanya kolom publik.
   */
  findPublicByUsername(username: string): Promise<PublicUserRow | null>;

  countApprovedContributions(userId: string): Promise<number>;

  /** COUNT contribution_reviews reviewer_id = user AND status != pending. */
  countVerificationsDone(userId: string): Promise<number>;

  countPublishedComments(userId: string): Promise<number>;

  loadStats(userId: string): Promise<PublicProfileStats>;

  /** Gabungan sumber aktivitas publik (limit per sumber, digabung di use-case). */
  listRecentApprovedContributions(userId: string, limit: number): Promise<PublicActivityItem[]>;
  listRecentPublishedComments(userId: string, limit: number): Promise<PublicActivityItem[]>;
  listRecentVerifications(userId: string, limit: number): Promise<PublicActivityItem[]>;
}

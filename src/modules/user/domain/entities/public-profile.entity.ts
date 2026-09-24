export interface PublicProfileStats {
  contributionsApproved: number;
  verificationsDone: number;
  commentsPublished: number;
}

export interface PublicProfile {
  username: string;
  displayName: string;
  bio: string | null;
  role: string;
  isVerifier: boolean;
  joinedAt: Date;
  avatarUrl: string | null;
  stats: PublicProfileStats;
}

/** Baris aman untuk SELECT publik: tanpa email/phone/hash/is_active. */
export interface PublicUserRow {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  role: string;
  joinedAt: Date;
  avatarUrl: string | null;
}

export type PublicActivityKind = 'contribution' | 'comment' | 'verification';

export interface PublicActivityItem {
  kind: PublicActivityKind;
  occurredAt: Date;
  wordId: string | null;
  lemma: string | null;
  summary: string;
}

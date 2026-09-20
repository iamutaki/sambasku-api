export interface PublicProfileStats {
  contributionsApproved: number;
  verificationsDone: number;
}

export interface PublicProfile {
  username: string;
  role: string;
  isVerifier: boolean;
  joinedAt: Date;
  stats: PublicProfileStats;
}

/** Baris aman untuk SELECT publik: tanpa email/phone/hash/is_active. */
export interface PublicUserRow {
  id: string;
  username: string;
  role: string;
  joinedAt: Date;
}

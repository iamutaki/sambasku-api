export interface AccountDeletionTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  isUsed: boolean;
  expiresAt: Date;
}

export interface NewAccountDeletionToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AccountDeletionTokenRepository {
  create(token: NewAccountDeletionToken): Promise<AccountDeletionTokenRecord>;
  findByHash(tokenHash: string): Promise<AccountDeletionTokenRecord | null>;
  /** Atomic: hanya berhasil jika belum dipakai dan belum kedaluwarsa. */
  consume(tokenHash: string): Promise<boolean>;
  invalidateUnusedForUser(userId: string): Promise<void>;
}

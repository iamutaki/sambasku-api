export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  isUsed: boolean;
  expiresAt: Date;
}

export interface NewPasswordResetToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetTokenRepository {
  create(token: NewPasswordResetToken): Promise<PasswordResetTokenRecord>;
  findByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  /**
   * Tandai token terpakai secara ATOMIK (UPDATE ... WHERE is_used = false).
   * Return false kalau token sudah pernah dikonsumsi — ini yang menjamin
   * token hanya bisa dipakai sekali, bahkan oleh request konkuren.
   */
  consume(tokenHash: string): Promise<boolean>;
}

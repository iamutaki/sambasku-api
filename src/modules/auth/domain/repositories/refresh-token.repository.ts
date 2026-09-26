export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  clientId: string | null;
  isRevoked: boolean;
  /** Waktu rotasi. Null = belum dirotasi, atau sudah dicabut paksa (logout). */
  rotatedAt: Date | null;
  expiresAt: Date;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  clientId?: string | null;
  deviceInfo?: string | null;
  ipAddress?: string | null;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Tandai token sudah dirotasi (bukan logout). Hanya baris yang masih
   * aktif. `false` = kalah race: permintaan lain sudah merotasinya.
   */
  markRotated(tokenHash: string): Promise<boolean>;
  revokeByHash(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface AccessTokenPayload {
  user_id: string; // ULID
  role: string;
  // Klaim identitas tambahan (opsional, backward-compatible): dipakai admin
  // saat restore sesi (decode JWT) untuk menampilkan nama user tanpa
  // bergantung cache sessionStorage (yang per-tab - lihat docs/api/auth).
  username?: string;
}

export interface TokenServicePort {
  generateAccessToken(payload: AccessTokenPayload): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
}

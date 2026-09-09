export interface AccessTokenPayload {
  user_id: string; // ULID
  role: string;
}

export interface TokenServicePort {
  generateAccessToken(payload: AccessTokenPayload): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
}

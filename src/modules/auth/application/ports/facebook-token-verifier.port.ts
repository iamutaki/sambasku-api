export interface FacebookAccessTokenClaims {
  /** Facebook Graph user id (identitas stabil, bukan email). */
  facebookUserId: string;
  email: string;
  name: string | null;
}

export interface FacebookTokenVerifierPort {
  verify(accessToken: string): Promise<FacebookAccessTokenClaims>;
}

export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleTokenVerifierPort {
  verify(idToken: string): Promise<GoogleIdTokenClaims>;
}

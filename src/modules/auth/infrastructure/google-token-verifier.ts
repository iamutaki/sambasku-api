import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/app-error';
import type {
  GoogleIdTokenClaims,
  GoogleTokenVerifierPort,
} from '../application/ports/google-token-verifier.port';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

const invalidToken = () =>
  new UnauthorizedError('INVALID_GOOGLE_TOKEN', 'Tidak bisa masuk dengan Google.');

export class GoogleTokenVerifier implements GoogleTokenVerifierPort {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly clientId: string | undefined) {}

  async verify(idToken: string): Promise<GoogleIdTokenClaims> {
    const audience = this.clientId?.trim();
    if (!audience) {
      throw new ServiceUnavailableError(
        'GOOGLE_AUTH_UNAVAILABLE',
        'Masuk dengan Google sedang tidak tersedia.',
      );
    }

    try {
      this.jwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: [...GOOGLE_ISSUERS],
        audience,
      });

      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      const email = typeof payload.email === 'string' ? payload.email : '';
      const emailVerified =
        payload.email_verified === true || payload.email_verified === 'true';
      const name = typeof payload.name === 'string' ? payload.name : null;

      if (!sub || !email || !emailVerified) {
        throw invalidToken();
      }

      return { sub, email, emailVerified: true, name };
    } catch (err) {
      if (err instanceof ServiceUnavailableError) throw err;
      if (err instanceof UnauthorizedError && err.errorCode === 'INVALID_GOOGLE_TOKEN') {
        throw err;
      }
      throw invalidToken();
    }
  }
}

import { env } from '@/shared/config/env';
import type { GoogleTokenVerifierPort } from '../application/ports/google-token-verifier.port';
import { GoogleTokenVerifier } from './google-token-verifier';

/** Seam e2e: ganti `current` dengan mock setelah app di-import. Jangan hit Google. */
export const googleTokenVerifierHolder: { current: GoogleTokenVerifierPort } = {
  current: new GoogleTokenVerifier(env.GOOGLE_CLIENT_ID),
};

export const googleTokenVerifier: GoogleTokenVerifierPort = {
  verify: (idToken) => googleTokenVerifierHolder.current.verify(idToken),
};

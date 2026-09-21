import { env } from '@/shared/config/env';
import type { FacebookTokenVerifierPort } from '../application/ports/facebook-token-verifier.port';
import { FacebookTokenVerifier } from './facebook-token-verifier';

/** Seam e2e: ganti `current` dengan mock setelah app di-import. Jangan hit Graph. */
export const facebookTokenVerifierHolder: { current: FacebookTokenVerifierPort } = {
  current: new FacebookTokenVerifier(env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET),
};

export const facebookTokenVerifier: FacebookTokenVerifierPort = {
  verify: (accessToken) => facebookTokenVerifierHolder.current.verify(accessToken),
};

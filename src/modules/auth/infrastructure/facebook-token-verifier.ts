import { ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/app-error';
import type {
  FacebookAccessTokenClaims,
  FacebookTokenVerifierPort,
} from '../application/ports/facebook-token-verifier.port';

/** Pin versi Graph. Jangan `latest`. */
export const FACEBOOK_GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
const FETCH_TIMEOUT_MS = 8_000;
const FACEBOOK_USER_AGENT = 'SambasKu/1.0 (https://kamus-sambas.app; auth-facebook)';

const invalidToken = () =>
  new UnauthorizedError('INVALID_FACEBOOK_TOKEN', 'Tidak bisa masuk dengan Facebook.');

export type FacebookFetch = typeof fetch;

export class FacebookTokenVerifier implements FacebookTokenVerifierPort {
  constructor(
    private readonly appId: string | undefined,
    private readonly appSecret: string | undefined,
    private readonly fetchImpl: FacebookFetch = fetch,
  ) {}

  async verify(accessToken: string): Promise<FacebookAccessTokenClaims> {
    const appId = this.appId?.trim();
    const appSecret = this.appSecret?.trim();
    if (!appId || !appSecret) {
      throw new ServiceUnavailableError(
        'FACEBOOK_AUTH_UNAVAILABLE',
        'Masuk dengan Facebook sedang tidak tersedia.',
      );
    }

    try {
      const debug = await this.debugToken(accessToken, appId, appSecret);
      if (
        debug.isValid !== true ||
        debug.appId !== appId ||
        !debug.userId ||
        isExpired(debug.expiresAt)
      ) {
        throw invalidToken();
      }

      const profile = await this.fetchMe(accessToken);
      if (!profile.id || profile.id !== debug.userId || !profile.email) {
        throw invalidToken();
      }

      return {
        facebookUserId: profile.id,
        email: profile.email,
        name: profile.name,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableError) throw err;
      if (err instanceof UnauthorizedError && err.errorCode === 'INVALID_FACEBOOK_TOKEN') {
        throw err;
      }
      throw invalidToken();
    }
  }

  private async debugToken(
    inputToken: string,
    appId: string,
    appSecret: string,
  ): Promise<{ isValid: boolean; appId: string; userId: string; expiresAt: number }> {
    const url = new URL(`${GRAPH_BASE}/debug_token`);
    url.searchParams.set('input_token', inputToken);
    url.searchParams.set('access_token', `${appId}|${appSecret}`);

    const body = await this.getJson(url);
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    if (!data) throw invalidToken();

    const expiresAt = typeof data.expires_at === 'number' ? data.expires_at : NaN;
    return {
      isValid: data.is_valid === true,
      appId: typeof data.app_id === 'string' ? data.app_id : '',
      userId: typeof data.user_id === 'string' ? data.user_id : '',
      expiresAt,
    };
  }

  private async fetchMe(
    userToken: string,
  ): Promise<{ id: string; email: string; name: string | null }> {
    const url = new URL(`${GRAPH_BASE}/me`);
    url.searchParams.set('fields', 'id,name,email');
    url.searchParams.set('access_token', userToken);

    const body = await this.getJson(url);
    if (!isRecord(body)) throw invalidToken();

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    return {
      id: typeof body.id === 'string' ? body.id : '',
      email,
      name: typeof body.name === 'string' ? body.name : null,
    };
  }

  private async getJson(url: URL): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': FACEBOOK_USER_AGENT,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw invalidToken();
    }

    if (!res.ok) throw invalidToken();

    try {
      return await res.json();
    } catch {
      throw invalidToken();
    }
  }
}

function isExpired(expiresAt: number): boolean {
  if (!Number.isFinite(expiresAt)) return true;
  if (expiresAt === 0) return false;
  return expiresAt * 1000 <= Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

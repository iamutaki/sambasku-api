import { describe, it, expect, vi } from 'vitest';
import { ServiceUnavailableError } from '@/shared/errors/app-error';
import { FacebookTokenVerifier } from '../../infrastructure/facebook-token-verifier';

const APP_ID = '1234567890';
const APP_SECRET = 'app-secret';
const USER_ID = '10201122334455';
const USER_TOKEN = 'EAAGm0PX4ZCpsBA...';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeVerifier(fetchImpl: typeof fetch) {
  return new FacebookTokenVerifier(APP_ID, APP_SECRET, fetchImpl);
}

function debugOk(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      is_valid: true,
      app_id: APP_ID,
      user_id: USER_ID,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    },
  };
}

function meOk(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: 'Budi Santoso',
    email: 'budi@example.com',
    ...overrides,
  };
}

describe('FacebookTokenVerifier', () => {
  it('FACEBOOK_APP_ID kosong → 503, tidak panggil Graph', async () => {
    const fetchImpl = vi.fn();
    const verifier = new FacebookTokenVerifier(undefined, APP_SECRET, fetchImpl);
    await expect(verifier.verify(USER_TOKEN)).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(verifier.verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'FACEBOOK_AUTH_UNAVAILABLE',
      statusCode: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('FACEBOOK_APP_SECRET whitespace → 503', async () => {
    const fetchImpl = vi.fn();
    const verifier = new FacebookTokenVerifier(APP_ID, '   ', fetchImpl);
    await expect(verifier.verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'FACEBOOK_AUTH_UNAVAILABLE',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('debug_token valid + /me email → claims', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/debug_token')) return jsonResponse(debugOk());
      if (url.includes('/me')) return jsonResponse(meOk());
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;

    const claims = await makeVerifier(fetchImpl).verify(USER_TOKEN);
    expect(claims).toEqual({
      facebookUserId: USER_ID,
      email: 'budi@example.com',
      name: 'Budi Santoso',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('app_id tidak cocok → INVALID_FACEBOOK_TOKEN', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(debugOk({ app_id: 'other-app' }))) as unknown as typeof fetch;
    await expect(makeVerifier(fetchImpl).verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
      statusCode: 401,
    });
  });

  it('is_valid false → INVALID_FACEBOOK_TOKEN', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(debugOk({ is_valid: false }))) as unknown as typeof fetch;
    await expect(makeVerifier(fetchImpl).verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });
  });

  it('expires_at lewat → INVALID_FACEBOOK_TOKEN', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(debugOk({ expires_at: Math.floor(Date.now() / 1000) - 10 })),
    ) as unknown as typeof fetch;
    await expect(makeVerifier(fetchImpl).verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });
  });

  it('expires_at 0 (tidak kedaluwarsa) + /me ok → claims', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/debug_token')) return jsonResponse(debugOk({ expires_at: 0 }));
      return jsonResponse(meOk());
    }) as unknown as typeof fetch;
    const claims = await makeVerifier(fetchImpl).verify(USER_TOKEN);
    expect(claims.facebookUserId).toBe(USER_ID);
  });

  it('/me tanpa email → INVALID_FACEBOOK_TOKEN', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/debug_token')) return jsonResponse(debugOk());
      return jsonResponse(meOk({ email: '' }));
    }) as unknown as typeof fetch;
    await expect(makeVerifier(fetchImpl).verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });
  });

  it('/me id tidak cocok user_id debug_token → INVALID_FACEBOOK_TOKEN', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/debug_token')) return jsonResponse(debugOk());
      return jsonResponse(meOk({ id: 'lain' }));
    }) as unknown as typeof fetch;
    await expect(makeVerifier(fetchImpl).verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });
  });

  it('Graph non-OK → INVALID_FACEBOOK_TOKEN (bukan 502)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'down' } }, 500)) as unknown as typeof fetch;
    await expect(makeVerifier(fetchImpl).verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
      statusCode: 401,
    });
  });

  it('jaringan gagal → INVALID_FACEBOOK_TOKEN', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    await expect(makeVerifier(fetchImpl).verify(USER_TOKEN)).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });
  });
});

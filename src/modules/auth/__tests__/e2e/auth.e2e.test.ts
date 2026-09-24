import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { capturedOtpDisplayCode } from '@/shared/testing/e2e-auth';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import -
// .env dev tidak boleh pernah tersentuh dari test (api-base-stack.md Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

describe.skipIf(!hasTestDb)('Auth E2E', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;

  beforeAll(async () => {
    const { testClient } = await import('hono/testing');
    const appModule = await import('@/app');
    app = appModule.app;
    client = testClient(app as never);
  });

  it('GET / → 200 info API, bukan 404', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.docs).toBe('/docs');
  });

  it('route tidak dikenal → 404 dengan envelope standar', async () => {
    const res = await app.request('/ruta-tidak-ada');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error_code: 'NOT_FOUND',
      message: 'Route tidak ditemukan',
      details: null,
    });
  });

  const unique = () => `budi+${Date.now()}${Math.floor(Math.random() * 1000)}@test.com`;

  // Rate-limiter keyed by x-forwarded-for - IP unik per call mengisolasi
  // bucket antar test (register 5/jam, login 5/15menit per IP)
  let ipSeq = 0;
  const xff = () => ({ 'x-forwarded-for': `10.0.0.${++ipSeq}` });

  const register = (email: string) =>
    client.api.v1.auth.register.$post(
      {
        json: {
          name: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
          email,
          password: 'Password123',
          confirm_password: 'Password123',
        },
      },
      { headers: xff() },
    );

  const verifyEmail = (email: string, code?: string) =>
    client.api.v1.auth['verify-email'].$post(
      { json: { email, code: code ?? capturedOtpDisplayCode() } },
      { headers: xff() },
    );

  const registerAndVerify = async (email: string) => {
    const res = await register(email);
    expect(res.status).toBe(201);
    const verifyRes = await verifyEmail(email);
    expect(verifyRes.status).toBe(200);
    return res;
  };

  it('POST /api/v1/auth/register → 201 + envelope standar', async () => {
    const res = await register(unique());
    expect([201, 409]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user_id).toBeDefined();
    expect(body.data.verification_required).toBe(true);
    expect(body.data.password_hash).toBeUndefined(); // tidak boleh bocor
    expect(body.data.access_token).toBeUndefined();
  });

  it('POST /api/v1/auth/register body tidak valid → 400 VALIDATION_ERROR + details', async () => {
    const res = await client.api.v1.auth.register.$post({
      json: { name: 'x', email: 'bukan-email', password: 'pendek', confirm_password: 'beda' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('POST /api/v1/auth/login sebelum verify → 403 EMAIL_NOT_VERIFIED', async () => {
    const email = unique();
    await register(email);

    const res = await client.api.v1.auth.login.$post({ json: { email, password: 'Password123' } }, { headers: xff() });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error_code).toBe('EMAIL_NOT_VERIFIED');
    expect(body.details).toEqual([{ field: 'email', message: email }]);
    expect(body.data).toBeUndefined();
  });

  it('POST /api/v1/auth/verify-email kode benar → 200 JWT', async () => {
    const email = unique();
    await register(email);
    const res = await client.api.v1.auth['verify-email'].$post(
      { json: { email, code: capturedOtpDisplayCode(), client_type: 'mobile' } },
      { headers: xff() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.access_token).toBeDefined();
    expect(body.data.refresh_token).toBeDefined();
  });

  it('POST /api/v1/auth/verify-email kode salah → 401 INVALID_OTP', async () => {
    const email = unique();
    await register(email);
    const res = await verifyEmail(email, '000000');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('INVALID_OTP');
  });

  it('POST /api/v1/auth/resend-otp email tak dikenal selalu 200 (anti-enumeration)', async () => {
    const res = await client.api.v1.auth['resend-otp'].$post(
      { json: { email: unique() } },
      { headers: xff() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('POST /api/v1/auth/resend-otp segera setelah register → 429 RATE_LIMITED', async () => {
    const email = unique();
    await register(email);
    const res = await client.api.v1.auth['resend-otp'].$post(
      { json: { email } },
      { headers: xff() },
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error_code).toBe('RATE_LIMITED');
  });

  it('POST /api/v1/auth/login → 200 access_token + cookie httpOnly', async () => {
    const email = unique();
    await registerAndVerify(email);

    const res = await client.api.v1.auth.login.$post({ json: { email, password: 'Password123' } }, { headers: xff() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.access_token).toBeDefined();
    expect(body.data.expires_in).toBe(900);

    const cookie = res.headers.getSetCookie().find((c: string) => c.startsWith('refresh_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/httponly/i);
    expect(cookie).toMatch(/samesite=strict/i);
  });

  it('POST /api/v1/auth/login password salah → 401 INVALID_CREDENTIALS', async () => {
    const email = unique();
    await register(email);

    const res = await client.api.v1.auth.login.$post({ json: { email, password: 'salah123' } }, { headers: xff() });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/refresh → token dirotasi (cookie baru + token lama mati)', async () => {
    const email = unique();
    await registerAndVerify(email);
    const loginRes = await client.api.v1.auth.login.$post({ json: { email, password: 'Password123' } }, { headers: xff() });
    const cookie = loginRes.headers
      .getSetCookie()
      .find((c: string) => c.startsWith('refresh_token='));
    const oldToken = (cookie ?? '').match(/refresh_token=([^;]+)/)?.[1];
    expect(oldToken).toBeDefined();

    // Rotasi pertama: sukses, dapat cookie baru
    const res1 = await client.api.v1.auth.refresh.$post(undefined, {
      headers: { cookie: `refresh_token=${oldToken}` },
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data.access_token).toBeDefined();
    const newCookie = res1.headers
      .getSetCookie()
      .find((c: string) => c.startsWith('refresh_token='));
    const newToken = (newCookie ?? '').match(/refresh_token=([^;]+)/)?.[1];
    expect(newToken).not.toBe(oldToken);

    // Token lama sudah revoked → tidak bisa dipakai lagi (cegah replay)
    const res2 = await client.api.v1.auth.refresh.$post(undefined, {
      headers: { cookie: `refresh_token=${oldToken}` },
    });
    expect(res2.status).toBe(401);
  });

  it('MOBILE: login client_type mobile → refresh_token di body (tanpa cookie)', async () => {
    const email = unique();
    await registerAndVerify(email);
    const res = await client.api.v1.auth.login.$post(
      { json: { email, password: 'Password123', client_type: 'mobile' } },
      { headers: xff() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.refresh_token).toBeDefined();
    // klien mobile tidak mengandalkan cookie
    expect(res.headers.getSetCookie().length).toBe(0);
  });

  it('MOBILE: refresh via body → token rotasi di body, token lama mati', async () => {
    const email = unique();
    await registerAndVerify(email);
    const loginRes = await client.api.v1.auth.login.$post(
      { json: { email, password: 'Password123', client_type: 'mobile' } },
      { headers: xff() },
    );
    const loginBody = await loginRes.json();
    const oldToken = loginBody.data.refresh_token as string;

    const res1 = await client.api.v1.auth.refresh.$post(
      { json: { refresh_token: oldToken } },
      { headers: {} },
    );
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data.access_token).toBeDefined();
    expect(body1.data.refresh_token).toBeDefined();
    expect(body1.data.refresh_token).not.toBe(oldToken);

    // token lama sudah revoked (replay ditolak)
    const res2 = await client.api.v1.auth.refresh.$post({ json: { refresh_token: oldToken } });
    expect(res2.status).toBe(401);
  });

  // ---- POST /api/v1/auth/change-password (10-api-ubah-password.md) ----
  // Rate limit 5/15 menit per user_id - setiap test pakai user segar.
  const loginMobile = async (email: string, password: string) => {
    const res = await client.api.v1.auth.login.$post(
      { json: { email, password, client_type: 'mobile' } },
      { headers: xff() },
    );
    return { status: res.status, body: await res.json() };
  };

  const changePassword = (body: unknown, token?: string) =>
    app.request('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...xff(),
      },
    });

  it('change-password: sukses → refresh lama mati, login password baru sukses', async () => {
    const email = unique();
    await registerAndVerify(email);
    const login = await loginMobile(email, 'Password123');
    expect(login.status).toBe(200);
    const { access_token: token, refresh_token: oldRefresh } = login.body.data;

    const res = await changePassword(
      {
        old_password: 'Password123',
        new_password: 'PasswordBaru123',
        confirm_password: 'PasswordBaru123',
      },
      token,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { message: 'Password berhasil diubah. Silakan login kembali.' },
    });

    // Semua session ter-revoke: refresh token lama ditolak
    const refreshRes = await client.api.v1.auth.refresh.$post({ json: { refresh_token: oldRefresh } });
    expect(refreshRes.status).toBe(401);

    // Login dengan password BARU sukses, password lama ditolak
    expect((await loginMobile(email, 'PasswordBaru123')).status).toBe(200);
    expect((await loginMobile(email, 'Password123')).status).toBe(401);
  });

  it('change-password: password lama salah → 401 INVALID_CREDENTIALS', async () => {
    const email = unique();
    await registerAndVerify(email);
    const login = await loginMobile(email, 'Password123');

    const res = await changePassword(
      {
        old_password: 'PasswordSalah1',
        new_password: 'PasswordBaru123',
        confirm_password: 'PasswordBaru123',
      },
      login.body.data.access_token,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error_code: 'INVALID_CREDENTIALS', message: 'Password lama salah' });
  });

  it('change-password: validasi (lemah / confirm beda / sama dengan lama) → 400', async () => {
    const email = unique();
    await registerAndVerify(email);
    const login = await loginMobile(email, 'Password123');
    const token = login.body.data.access_token;

    const weak = await changePassword(
      { old_password: 'Password123', new_password: 'pendek', confirm_password: 'pendek' },
      token,
    );
    expect(weak.status).toBe(400);

    const mismatch = await changePassword(
      { old_password: 'Password123', new_password: 'PasswordBaru123', confirm_password: 'BedaSekali123' },
      token,
    );
    expect(mismatch.status).toBe(400);
    const mismatchBody = await mismatch.json();
    expect(mismatchBody.error_code).toBe('VALIDATION_ERROR');

    const sameAsOld = await changePassword(
      { old_password: 'Password123', new_password: 'Password123', confirm_password: 'Password123' },
      token,
    );
    expect(sameAsOld.status).toBe(400);
  });

  it('change-password: tanpa token → 401', async () => {
    const res = await changePassword({
      old_password: 'Password123',
      new_password: 'PasswordBaru123',
      confirm_password: 'PasswordBaru123',
    });
    expect(res.status).toBe(401);
  });

  // ---- POST /api/v1/auth/google (AUTH_GOOGLE.md) — mock verifier, jangan hit Google ----
  const postGoogle = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/api/v1/auth/google', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...xff(), ...headers },
    }) as Promise<Response>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonBody = (res: Response): Promise<any> => res.json();

  async function withGoogleVerifier<T>(
    mock: { verify: (idToken: string) => Promise<{ sub: string; email: string; emailVerified: boolean; name: string | null }> },
    fn: () => Promise<T>,
  ): Promise<T> {
    const { googleTokenVerifierHolder } = await import(
      '@/modules/auth/infrastructure/google-token-verifier.holder'
    );
    const original = googleTokenVerifierHolder.current;
    googleTokenVerifierHolder.current = mock;
    try {
      return await fn();
    } finally {
      googleTokenVerifierHolder.current = original;
    }
  }

  it('POST /google mobile → 200 + refresh_token di body', async () => {
    const email = unique();
    const res = await withGoogleVerifier(
      {
        verify: async () => ({
          sub: `sub-${email}`,
          email,
          emailVerified: true,
          name: 'Google User',
        }),
      },
      () => postGoogle({ id_token: 'fake-id-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.success).toBe(true);
    expect(body.data.access_token).toEqual(expect.any(String));
    expect(body.data.refresh_token).toEqual(expect.any(String));
    expect(body.data.user.role).toBe('contributor');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('POST /google token invalid → 401 INVALID_GOOGLE_TOKEN', async () => {
    const { UnauthorizedError } = await import('@/shared/errors/app-error');
    const res = await withGoogleVerifier(
      {
        verify: async () => {
          throw new UnauthorizedError('INVALID_GOOGLE_TOKEN', 'Tidak bisa masuk dengan Google.');
        },
      },
      () => postGoogle({ id_token: 'bad-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(401);
    expect(await jsonBody(res)).toMatchObject({
      success: false,
      error_code: 'INVALID_GOOGLE_TOKEN',
      message: 'Tidak bisa masuk dengan Google.',
    });
  });

  it('POST /google email existing tanpa identity Google → 409 EMAIL_ALREADY_EXISTS', async () => {
    const email = unique();
    await registerAndVerify(email);
    const res = await withGoogleVerifier(
      {
        verify: async () => ({
          sub: `sub-new-${email}`,
          email,
          emailVerified: true,
          name: 'Budi',
        }),
      },
      () => postGoogle({ id_token: 'fake-id-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(409);
    expect(await jsonBody(res)).toMatchObject({
      error_code: 'EMAIL_ALREADY_EXISTS',
      message: 'Email sudah terdaftar. Masuk dengan password atau gunakan lupa password.',
    });
  });

  it('POST /google verifier 503 → GOOGLE_AUTH_UNAVAILABLE', async () => {
    const { ServiceUnavailableError } = await import('@/shared/errors/app-error');
    const res = await withGoogleVerifier(
      {
        verify: async () => {
          throw new ServiceUnavailableError(
            'GOOGLE_AUTH_UNAVAILABLE',
            'Masuk dengan Google sedang tidak tersedia.',
          );
        },
      },
      () => postGoogle({ id_token: 'fake-id-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(503);
    expect(await jsonBody(res)).toMatchObject({
      error_code: 'GOOGLE_AUTH_UNAVAILABLE',
      message: 'Masuk dengan Google sedang tidak tersedia.',
    });
  });

  it('POST /google id_token kosong → 400 VALIDATION_ERROR', async () => {
    const res = await postGoogle({ id_token: '', client_type: 'mobile' });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.error_code).toBe('VALIDATION_ERROR');
  });

  it('POST /google/link lalu login Google dual-method; DELETE unlink', async () => {
    const email = unique();
    await register(email);
    const verifyRes = await client.api.v1.auth['verify-email'].$post(
      { json: { email, code: capturedOtpDisplayCode(), client_type: 'mobile' } },
      { headers: xff() },
    );
    expect(verifyRes.status).toBe(200);
    const accessToken = (await verifyRes.json()).data.access_token as string;
    const sub = `sub-link-${email}`;

    const linkRes = await withGoogleVerifier(
      {
        verify: async () => ({
          sub,
          email: `g-${email}`,
          emailVerified: true,
          name: 'Linked',
        }),
      },
      () =>
        app.request('/api/v1/auth/google/link', {
          method: 'POST',
          body: JSON.stringify({ id_token: 'link-token' }),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
            ...xff(),
          },
        }) as Promise<Response>,
    );
    expect(linkRes.status).toBe(200);
    expect(await jsonBody(linkRes)).toMatchObject({
      success: true,
      data: { provider: 'google' },
    });

    const providersRes = await app.request('/api/v1/auth/providers', {
      headers: { authorization: `Bearer ${accessToken}`, ...xff() },
    });
    expect(providersRes.status).toBe(200);
    const providersBody = await jsonBody(providersRes);
    expect(providersBody.data.providers.some((p: { provider: string }) => p.provider === 'google')).toBe(
      true,
    );

    const loginRes = await withGoogleVerifier(
      {
        verify: async () => ({
          sub,
          email: `g-${email}`,
          emailVerified: true,
          name: 'Linked',
        }),
      },
      () => postGoogle({ id_token: 'login-after-link', client_type: 'mobile' }),
    );
    expect(loginRes.status).toBe(200);

    const unlinkRes = await app.request('/api/v1/auth/google/link', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}`, ...xff() },
    });
    expect(unlinkRes.status).toBe(200);
  });

  it('PATCH /users/me updates display_name + bio; GET public reflects', async () => {
    const email = unique();
    const name = `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const regRes = await client.api.v1.auth.register.$post(
      {
        json: {
          name,
          email,
          password: 'Password123',
          confirm_password: 'Password123',
        },
      },
      { headers: xff() },
    );
    expect(regRes.status).toBe(201);
    const verifyRes = await client.api.v1.auth['verify-email'].$post(
      { json: { email, code: capturedOtpDisplayCode(), client_type: 'mobile' } },
      { headers: xff() },
    );
    expect(verifyRes.status).toBe(200);
    const accessToken = (await verifyRes.json()).data.access_token as string;

    const patchRes = await app.request('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ display_name: 'Nama Baru', bio: 'Bio singkat' }),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    });
    expect(patchRes.status).toBe(200);
    expect(await jsonBody(patchRes)).toMatchObject({
      data: { username: name, display_name: 'Nama Baru', bio: 'Bio singkat' },
    });

    const publicRes = await app.request(`/api/v1/users/${encodeURIComponent(name)}`);
    expect(publicRes.status).toBe(200);
    expect(await jsonBody(publicRes)).toMatchObject({
      data: { username: name, display_name: 'Nama Baru', bio: 'Bio singkat' },
    });
  });

  // ---- POST /api/v1/auth/facebook (AUTH_FACEBOOK.md) — mock verifier, jangan hit Graph ----
  const postFacebook = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/api/v1/auth/facebook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...xff(), ...headers },
    }) as Promise<Response>;

  async function withFacebookVerifier<T>(
    mock: {
      verify: (accessToken: string) => Promise<{
        facebookUserId: string;
        email: string;
        name: string | null;
      }>;
    },
    fn: () => Promise<T>,
  ): Promise<T> {
    const { facebookTokenVerifierHolder } = await import(
      '@/modules/auth/infrastructure/facebook-token-verifier.holder'
    );
    const original = facebookTokenVerifierHolder.current;
    facebookTokenVerifierHolder.current = mock;
    try {
      return await fn();
    } finally {
      facebookTokenVerifierHolder.current = original;
    }
  }

  it('POST /facebook mobile → 200 + refresh_token di body', async () => {
    const email = unique();
    const res = await withFacebookVerifier(
      {
        verify: async () => ({
          facebookUserId: `fb-${email}`,
          email,
          name: 'Facebook User',
        }),
      },
      () => postFacebook({ access_token: 'fake-fb-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.success).toBe(true);
    expect(body.data.access_token).toEqual(expect.any(String));
    expect(body.data.refresh_token).toEqual(expect.any(String));
    expect(body.data.user.role).toBe('contributor');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('POST /facebook token invalid → 401 INVALID_FACEBOOK_TOKEN', async () => {
    const { UnauthorizedError } = await import('@/shared/errors/app-error');
    const res = await withFacebookVerifier(
      {
        verify: async () => {
          throw new UnauthorizedError('INVALID_FACEBOOK_TOKEN', 'Tidak bisa masuk dengan Facebook.');
        },
      },
      () => postFacebook({ access_token: 'bad-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(401);
    expect(await jsonBody(res)).toMatchObject({
      success: false,
      error_code: 'INVALID_FACEBOOK_TOKEN',
      message: 'Tidak bisa masuk dengan Facebook.',
    });
  });

  it('POST /facebook email existing tanpa identity Facebook → 409 EMAIL_ALREADY_EXISTS', async () => {
    const email = unique();
    await registerAndVerify(email);
    const res = await withFacebookVerifier(
      {
        verify: async () => ({
          facebookUserId: `fb-new-${email}`,
          email,
          name: 'Budi',
        }),
      },
      () => postFacebook({ access_token: 'fake-fb-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(409);
    expect(await jsonBody(res)).toMatchObject({
      error_code: 'EMAIL_ALREADY_EXISTS',
      message: 'Email sudah terdaftar. Masuk dengan password atau gunakan lupa password.',
    });
  });

  it('POST /facebook verifier 503 → FACEBOOK_AUTH_UNAVAILABLE', async () => {
    const { ServiceUnavailableError } = await import('@/shared/errors/app-error');
    const res = await withFacebookVerifier(
      {
        verify: async () => {
          throw new ServiceUnavailableError(
            'FACEBOOK_AUTH_UNAVAILABLE',
            'Masuk dengan Facebook sedang tidak tersedia.',
          );
        },
      },
      () => postFacebook({ access_token: 'fake-fb-token', client_type: 'mobile' }),
    );
    expect(res.status).toBe(503);
    expect(await jsonBody(res)).toMatchObject({
      error_code: 'FACEBOOK_AUTH_UNAVAILABLE',
      message: 'Masuk dengan Facebook sedang tidak tersedia.',
    });
  });

  it('POST /facebook access_token kosong → 400 VALIDATION_ERROR', async () => {
    const res = await postFacebook({ access_token: '', client_type: 'mobile' });
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.error_code).toBe('VALIDATION_ERROR');
  });

  const postAccount = (path: string, body: unknown, token?: string) =>
    app.request(`/api/v1/auth${path}`, {
      method: path === '/account' ? 'DELETE' : 'POST',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...xff(),
      },
    });

  it('DELETE /account: kata sandi benar menghapus, login lama ditolak', async () => {
    const email = unique();
    await registerAndVerify(email);
    const login = await loginMobile(email, 'Password123');
    expect(login.status).toBe(200);

    const res = await postAccount(
      '/account',
      { password: 'Password123', confirmation: 'HAPUS' },
      login.body.data.access_token,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { message: 'Akun dan data pribadi berhasil dihapus.' },
    });
    expect((await loginMobile(email, 'Password123')).status).toBe(401);
  });

  it('DELETE /account: kata sandi salah → 401, akun tetap bisa masuk', async () => {
    const email = unique();
    await registerAndVerify(email);
    const login = await loginMobile(email, 'Password123');

    const res = await postAccount(
      '/account',
      { password: 'PasswordSalah1', confirmation: 'HAPUS' },
      login.body.data.access_token,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error_code: 'INVALID_CREDENTIALS' });
    expect((await loginMobile(email, 'Password123')).status).toBe(200);
  });

  it('kode email menghapus akun, kode yang sama tidak bisa dipakai dua kali', async () => {
    const email = unique();
    await registerAndVerify(email);

    const requestRes = await postAccount('/delete-account/request', { email });
    expect(requestRes.status).toBe(200);

    const code = capturedOtpDisplayCode();
    const confirmRes = await postAccount('/delete-account/confirm', {
      email,
      code,
      confirmation: 'HAPUS',
    });
    expect(confirmRes.status).toBe(200);

    const again = await postAccount('/delete-account/confirm', {
      email,
      code,
      confirmation: 'HAPUS',
    });
    expect(again.status).toBe(401);
    expect((await loginMobile(email, 'Password123')).status).toBe(401);
  });
});

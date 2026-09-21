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

  it('POST /api/v1/auth/resend-otp selalu 200 (anti-enumeration)', async () => {
    const res = await client.api.v1.auth['resend-otp'].$post(
      { json: { email: unique() } },
      { headers: xff() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
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
});

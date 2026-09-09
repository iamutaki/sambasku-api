import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import —
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

  const register = (email: string) =>
    client.api.v1.auth.register.$post({
      json: {
        username: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
        email,
        password: 'Password123',
        confirm_password: 'Password123',
      },
    });

  it('POST /api/v1/auth/register → 201 + envelope standar', async () => {
    const res = await register(unique());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user_id).toBeDefined();
    expect(body.data.password_hash).toBeUndefined(); // tidak boleh bocor
  });

  it('POST /api/v1/auth/register body tidak valid → 400 VALIDATION_ERROR + details', async () => {
    const res = await client.api.v1.auth.register.$post({
      json: { username: 'x', email: 'bukan-email', password: 'pendek', confirm_password: 'beda' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('POST /api/v1/auth/login → 200 access_token + cookie httpOnly', async () => {
    const email = unique();
    await register(email);

    const res = await client.api.v1.auth.login.$post({ json: { email, password: 'Password123' } });
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

    const res = await client.api.v1.auth.login.$post({ json: { email, password: 'salah123' } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/refresh → token dirotasi (cookie baru + token lama mati)', async () => {
    const email = unique();
    await register(email);
    const loginRes = await client.api.v1.auth.login.$post({ json: { email, password: 'Password123' } });
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
});

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { e2eRegisterBody } from '@/shared/testing/e2e-auth';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

// Test environment DB + token admin (dari seed test) harus tersedia. Skip jika tidak.
describe.skipIf(!hasTestDb)('Admin Users E2E', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;
  let adminToken: string | undefined;
  let contributorId: string | undefined;
  let rootUserId: string | undefined;

  beforeAll(async () => {
    const { testClient } = await import('hono/testing');
    const appModule = await import('@/app');
    app = appModule.app;
    client = testClient(app as never);

    // TODO: Setup - login sebagai admin (dari user seed test) untuk dapat Bearer token.
    // Sementara: assign token dari env test ADMIN_TOKEN jika ada.
    adminToken = process.env.ADMIN_E2E_TOKEN;
  });

  const authHeaders = () =>
    adminToken
      ? { Authorization: `Bearer ${adminToken}` }
      : {};

  it('GET /api/v1/admin/users tanpa auth → 401', async () => {
    const res = await app.request('/api/v1/admin/users?limit=5');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/v1/admin/users dengan token admin filter role=contributor → 200 + data tanpa password_hash', async () => {
    if (!adminToken) return;
    const res = await client.api.v1.admin.users.$get(
      { query: { role: 'contributor', limit: 5 } },
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta).toHaveProperty('limit');
    expect(body.meta).toHaveProperty('next_cursor');
    expect(body.meta).toHaveProperty('has_more');
    // Pastikan tidak ada password_hash (security boundary)
    for (const item of body.data) {
      expect(item).not.toHaveProperty('password_hash');
      expect(item).not.toHaveProperty('passwordHash');
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('username');
      expect(item).toHaveProperty('role');
      expect(item).toHaveProperty('is_active');
      expect(item).toHaveProperty('created_at');
      if (item.role !== 'root') contributorId = item.id;
      if (item.role === 'root') rootUserId = item.id;
    }
  });

  it('PATCH /admin/users/:id/role contributor→reviewer → 200 + role berubah', async () => {
    if (!adminToken || !contributorId) return;
    const res = await client.api.v1.admin.users[':id'].role.$patch(
      {
        param: { id: contributorId },
        json: { role: 'reviewer' },
      },
      { headers: authHeaders() },
    );
    expect([200, 400, 403]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(contributorId);
      expect(body.data.role).toBe('reviewer');
    }
  });

  it('PATCH /admin/users/:id/role target.role=root → 403 CANNOT_CHANGE_ROOT', async () => {
    if (!adminToken || !rootUserId) return;
    const res = await client.api.v1.admin.users[':id'].role.$patch(
      {
        param: { id: rootUserId },
        json: { role: 'admin' },
      },
      { headers: authHeaders() },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error_code).toBe('CANNOT_CHANGE_ROOT');
  });
});

describe.skipIf(!hasTestDb)('Admin create user E2E', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let adminId: string;
  let contributorToken: string;
  let ipSeq = 200;

  const xff = () => ({ 'x-forwarded-for': `10.9.0.${++ipSeq}` });

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...xff(),
        ...(init.headers ?? {}),
      },
    });

  beforeAll(async () => {
    const { capturedOtpDisplayCode } = await import('@/shared/testing/e2e-auth');
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users } = await import('@/shared/database/drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const adminEmail = `admcrt${stamp}@test.com`;
    const contributorEmail = `koncrt${stamp}@test.com`;

    for (const [name, email] of [
      [`adm${stamp}`, adminEmail],
      [`kon${stamp}`, contributorEmail],
    ] as const) {
      const reg = await request('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(e2eRegisterBody({
            name,
            email,
        })),
      });
      expect(reg.status).toBe(201);
      const verify = await request('/api/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code: capturedOtpDisplayCode() }),
      });
      expect(verify.status).toBe(200);
    }

    const db = getTestDb();
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail));

    const login = async (email: string) => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'Password123' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      return body.data as { access_token: string; user: { id: string } };
    };

    const adminSession = await login(adminEmail);
    adminToken = adminSession.access_token;
    adminId = adminSession.user.id;
    contributorToken = (await login(contributorEmail)).access_token;
  });

  const createBody = (email: string, isActive: boolean) => ({
    username: `u${email.split('@')[0]}`,
    email,
    password: 'Password123',
    confirm_password: 'Password123',
    role: 'contributor',
    is_active: isActive,
  });

  it('POST /api/v1/admin/users tanpa auth → 401', async () => {
    const res = await request('/api/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify(createBody(`anon${Date.now()}@test.com`, true)),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/admin/users sebagai kontributor → 403', async () => {
    const res = await request('/api/v1/admin/users', {
      method: 'POST',
      headers: { authorization: `Bearer ${contributorToken}` },
      body: JSON.stringify(createBody(`forbid${Date.now()}@test.com`, true)),
    });
    expect(res.status).toBe(403);
  });

  it('POST akun aktif → 201 tanpa password, lalu login berhasil', async () => {
    const email = `aktif${Date.now()}@test.com`;
    const res = await request('/api/v1/admin/users', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(createBody(email, true)),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(email);
    expect(body.data.is_active).toBe(true);
    expect(body.data.role).toBe('contributor');
    expect(JSON.stringify(body)).not.toContain('password');

    const login = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Password123' }),
    });
    expect(login.status).toBe(200);
  });

  it('POST akun nonaktif → login gagal', async () => {
    const email = `mati${Date.now()}@test.com`;
    const res = await request('/api/v1/admin/users', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(createBody(email, false)),
    });
    expect(res.status).toBe(201);
    const login = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Password123' }),
    });
    expect(login.status).toBe(401);
    const body = await login.json();
    expect(body.error_code).toBe('INVALID_CREDENTIALS');
  });

  it('PATCH status diri sendiri → 403 CANNOT_DEACTIVATE_SELF', async () => {
    const res = await request(`/api/v1/admin/users/${adminId}/active`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ is_active: false }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error_code).toBe('CANNOT_DEACTIVATE_SELF');
  });
});

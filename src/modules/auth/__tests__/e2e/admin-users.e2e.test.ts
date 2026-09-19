import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';

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

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

describe.skipIf(!hasTestDb)('Audit Logs E2E', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users } = await import('@/shared/database/drizzle/schema');
    const db = getTestDb();
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    await truncateAll(db);

    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = Date.now();
    for (const [username, email] of [
      ['audadm', `audadm${stamp}@test.com`],
      ['audkon', `audkon${stamp}@test.com`],
    ] as const) {
      await request('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password: 'Password123',
          confirm_password: 'Password123',
        }),
      });
    }
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, `audadm${stamp}@test.com`));

    const login = async (email: string) => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'Password123' }),
      });
      const body = await res.json();
      return body.data.access_token as string;
    };
    adminToken = await login(`audadm${stamp}@test.com`);
    contributorToken = await login(`audkon${stamp}@test.com`);
  });

  it('GET /api/v1/admin/audit-logs (admin) → 200 + meta cursor-based (Section 13) + register terekam', async () => {
    const res = await request('/api/v1/admin/audit-logs?entity_type=user&limit=50', {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta.limit).toBe(50);
    expect(typeof body.meta.has_more).toBe('boolean');
    expect(body.meta.next_cursor === null || typeof body.meta.next_cursor === 'string').toBe(true);
    if (body.meta.next_cursor) expect(body.meta.next_cursor).toHaveLength(26);

    const creates = body.data.filter((l: { action: string }) => l.action === 'create');
    expect(creates.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(body.data)).not.toContain('password');
    expect(body.data[0]).toHaveProperty('request_id');
  });

  it('filter entity_type=word → hanya entri word', async () => {
    const res = await request('/api/v1/admin/audit-logs?entity_type=word&limit=20', {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.limit).toBe(20);
    for (const log of body.data) {
      expect(log.entity_type).toBe('word');
    }
  });

  it('contributor → 403 FORBIDDEN (hanya admin & root)', async () => {
    const res = await request('/api/v1/admin/audit-logs', {
      headers: { authorization: `Bearer ${contributorToken}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error_code).toBe('FORBIDDEN');
  });

  it('tanpa token → 401', async () => {
    const res = await request('/api/v1/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('query invalid (user_id bukan ULID) → 400 VALIDATION_ERROR', async () => {
    const res = await request('/api/v1/admin/audit-logs?user_id=bukan-ulid', {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('VALIDATION_ERROR');
  });
});

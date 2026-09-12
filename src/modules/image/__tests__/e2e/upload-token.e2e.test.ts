import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

describe.skipIf(!hasTestDb)('Image Upload Token E2E', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users } = await import('@/shared/database/drizzle/schema');
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    const db = getTestDb();
    await truncateAll(db);

    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = Date.now();
    const email = `imgadm${stamp}@test.com`;
    await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: `imgadm${stamp}`,
        email,
        password: 'Password123',
        confirm_password: 'Password123',
      }),
      headers: { 'x-forwarded-for': '10.1.0.1' },
    });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, email));
    const loginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Password123' }),
      headers: { 'x-forwarded-for': '10.1.0.1' },
    });
    adminToken = (await loginRes.json()).data.access_token;
  });

  it('tanpa token → 401', async () => {
    const res = await request('/api/v1/admin/images/upload-token');
    expect(res.status).toBe(401);
  });

  it('admin → 200 kredensial lengkap, ATAU 503 kalau provider belum dikonfigurasi', async () => {
    const res = await request('/api/v1/admin/images/upload-token?folder=/words', {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    if (res.status === 200) {
      expect(typeof body.data.token).toBe('string');
      expect(typeof body.data.signature).toBe('string');
      expect(body.data.upload_endpoint).toContain('imagekit');
    } else {
      expect(body.error_code).toBe('IMAGE_UPLOAD_UNAVAILABLE');
    }
  });
});

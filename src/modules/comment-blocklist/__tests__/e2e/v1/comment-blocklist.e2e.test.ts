import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

describe.skipIf(!hasTestDb)('Comment blocklist bulk + search', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  const post = (path: string, body: unknown, token?: string) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  const get = (path: string, token?: string) =>
    request(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users } = await import('@/shared/database/drizzle/schema');
    const db = getTestDb();
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    await truncateAll(db);

    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = Date.now();
    const email = `blk${stamp}@test.com`;
    await post('/api/v1/auth/register', {
      name: `blk${stamp}`,
      email,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await db.update(users).set({ emailVerified: true, role: 'admin' }).where(eq(users.email, email));
    const login = await post('/api/v1/auth/login', { email, password: 'Password123' });
    adminToken = ((await login.json()) as { data: { access_token: string } }).data.access_token;
  });

  it('bulk mengabaikan duplikat, pencarian menemukan kata, lalu bisa dihapus', async () => {
    const first = await post(
      '/api/v1/admin/comment-blocklist/bulk',
      { words: ['Lorem', 'Ipsum', ' dolo', 'Lorem', 'x'.repeat(101)] },
      adminToken,
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: { created_count: number; skipped_count: number; invalid_count: number };
    };
    expect(firstBody.data).toEqual({ created_count: 3, skipped_count: 1, invalid_count: 1 });

    const again = await post(
      '/api/v1/admin/comment-blocklist/bulk',
      { words: ['lorem', 'baru'] },
      adminToken,
    );
    expect(again.status).toBe(200);
    expect((await again.json()) as { data: { created_count: number; skipped_count: number } }).toMatchObject({
      data: { created_count: 1, skipped_count: 1 },
    });

    const found = await get('/api/v1/admin/comment-blocklist?q=IPS', adminToken);
    expect(found.status).toBe(200);
    const foundBody = (await found.json()) as { data: { id: string; word: string }[] };
    expect(foundBody.data.map((row) => row.word)).toEqual(['ipsum']);

    const removed = await request(`/api/v1/admin/comment-blocklist/${foundBody.data[0].id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(removed.status).toBe(200);

    const after = await get('/api/v1/admin/comment-blocklist?q=ipsum', adminToken);
    const afterBody = (await after.json()) as { data: unknown[] };
    expect(afterBody.data).toEqual([]);
  });
});

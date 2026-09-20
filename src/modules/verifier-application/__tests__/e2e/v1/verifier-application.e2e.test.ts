import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const body = {
  phone: '81234567890',
  address: 'Jl. Merdeka No. 1, Sambas, Kalimantan Barat',
  social_links: [{ platform: 'instagram', url: 'https://instagram.com/budi' }],
};

describe.skipIf(!hasTestDb)('Verifier application E2E v1 (20 doc)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;
  let contributorEmail: string;
  let applicationId: string;

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  const post = (path: string, payload: unknown, token?: string) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  const patch = (path: string, payload: unknown, token?: string) =>
    request(path, {
      method: 'PATCH',
      body: JSON.stringify(payload),
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
    const adminEmail = `admva${stamp}@test.com`;
    contributorEmail = `konva${stamp}@test.com`;
    await post('/api/v1/auth/register', {
      name: `admva${stamp}`,
      email: adminEmail,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await post('/api/v1/auth/register', {
      name: `konva${stamp}`,
      email: contributorEmail,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail));

    const login = async (email: string) => {
      const res = await post('/api/v1/auth/login', { email, password: 'Password123' });
      return ((await res.json()) as { data: { access_token: string } }).data.access_token;
    };
    adminToken = await login(adminEmail);
    contributorToken = await login(contributorEmail);
  });

  it('GET me sebelum apply → 404; admin apply → 403; contributor apply → 201', async () => {
    const missing = await get('/api/v1/verifier-applications/me', contributorToken);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error_code).toBe('VERIFIER_APPLICATION_NOT_FOUND');

    const asAdmin = await post('/api/v1/verifier-applications', body, adminToken);
    expect(asAdmin.status).toBe(403);
    expect((await asAdmin.json()).error_code).toBe('ALREADY_VERIFIER');

    const created = await post('/api/v1/verifier-applications', body, contributorToken);
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.data.status).toBe('pending');
    expect(createdBody.data.phone).toBe('6281234567890');
    applicationId = createdBody.data.id as string;

    const dup = await post('/api/v1/verifier-applications', body, contributorToken);
    expect(dup.status).toBe(409);
    expect((await dup.json()).error_code).toBe('APPLICATION_ALREADY_EXISTS');
  });

  it('alur admin: list → reject tanpa comment 400 → reject → PATCH → approve → role reviewer', async () => {
    const list = await get('/api/v1/admin/verifier-applications?status=pending', adminToken);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.data.some((i: { id: string }) => i.id === applicationId)).toBe(true);

    const asContributor = await get('/api/v1/admin/verifier-applications', contributorToken);
    expect(asContributor.status).toBe(403);

    const noComment = await post(
      `/api/v1/admin/verifier-applications/${applicationId}/reject`,
      {},
      adminToken,
    );
    expect(noComment.status).toBe(400);

    const rejected = await post(
      `/api/v1/admin/verifier-applications/${applicationId}/reject`,
      { comment: 'HP tidak bisa dihubungi' },
      adminToken,
    );
    expect(rejected.status).toBe(200);
    expect((await rejected.json()).data.status).toBe('rejected');

    const mine = await get('/api/v1/verifier-applications/me', contributorToken);
    const mineBody = await mine.json();
    expect(mineBody.data.status).toBe('rejected');
    expect(mineBody.data.admin_comment).toBe('HP tidak bisa dihubungi');

    const pendingPatch = await patch('/api/v1/verifier-applications/me', body, contributorToken);
    // setelah reject, PATCH harus sukses (pending). Jika sempat pending, 409.
    expect(pendingPatch.status).toBe(200);
    expect((await pendingPatch.json()).data.status).toBe('pending');

    const approved = await post(
      `/api/v1/admin/verifier-applications/${applicationId}/approve`,
      {},
      adminToken,
    );
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({
      success: true,
      data: { id: applicationId, status: 'approved', role: 'reviewer' },
    });

    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users } = await import('@/shared/database/drizzle/schema');
    const db = getTestDb();
    const [user] = await db.select().from(users).where(eq(users.email, contributorEmail)).limit(1);
    expect(user.role).toBe('reviewer');
  });
});

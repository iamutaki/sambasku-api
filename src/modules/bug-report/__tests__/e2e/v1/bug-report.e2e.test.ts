import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { capturedOtpDisplayCode } from '@/shared/testing/e2e-auth';
import { eq } from 'drizzle-orm';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const description = 'Tombol upvote tidak merespons di halaman detail kata';

describe.skipIf(!hasTestDb)('Bug report E2E v1 (30 doc)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers,
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
    const adminEmail = `admbug${stamp}@test.com`;
    const contribEmail = `konbug${stamp}@test.com`;
    await post('/api/v1/auth/register', {
      name: `admbug${stamp}`,
      email: adminEmail,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await post('/api/v1/auth/verify-email', { email: adminEmail, code: capturedOtpDisplayCode() });
    await post('/api/v1/auth/register', {
      name: `konbug${stamp}`,
      email: contribEmail,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    await post('/api/v1/auth/verify-email', { email: contribEmail, code: capturedOtpDisplayCode() });

    await db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail));

    adminToken = (
      await (
        await post('/api/v1/auth/login', { email: adminEmail, password: 'Password123' })
      ).json()
    ).data.access_token;
    contributorToken = (
      await (
        await post('/api/v1/auth/login', { email: contribEmail, password: 'Password123' })
      ).json()
    ).data.access_token;
  });

  it('token folder /words → 400 VALIDATION_ERROR', async () => {
    const res = await request('/api/v1/bug-reports/upload-token?folder=/words');
    expect(res.status).toBe(400);
    expect((await res.json()).error_code).toBe('VALIDATION_ERROR');
  });

  it('token folder /bug-reports → 200 atau 503 IMAGE_UPLOAD_UNAVAILABLE', async () => {
    const res = await request('/api/v1/bug-reports/upload-token?folder=/bug-reports');
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    if (res.status === 503) {
      expect(body.error_code).toBe('IMAGE_UPLOAD_UNAVAILABLE');
    } else {
      expect(typeof body.data.token).toBe('string');
    }
  });

  it('description pendek → 400', async () => {
    const res = await post('/api/v1/bug-reports', { description: 'pendek' });
    expect(res.status).toBe(400);
    expect((await res.json()).error_code).toBe('VALIDATION_ERROR');
  });

  it('images 5 item → 400', async () => {
    const img = {
      url: 'https://ik.imagekit.io/test/bug-reports/x.jpg',
      provider_file_id: 'x',
    };
    const res = await post('/api/v1/bug-reports', {
      description,
      images: [img, img, img, img, img],
    });
    expect(res.status).toBe(400);
  });

  it('tamu submit → 200 is_anonymous true; login → user terisi; admin list + resolve + resolve ulang 404', async () => {
    const anon = await post(
      '/api/v1/bug-reports',
      { description, platform: 'android', app_version: '0.1.0' },
      { 'x-device-id': '01JDDEVICEBUG000000000000' },
    );
    expect(anon.status).toBe(200);
    const anonBody = await anon.json();
    expect(anonBody.data.status).toBe('open');
    expect(anonBody.data.is_anonymous).toBe(true);

    const auth = await post(
      '/api/v1/bug-reports',
      { description: `${description} login` },
      { authorization: `Bearer ${contributorToken}`, 'x-device-id': '01JDDEVICEBUG000000000000' },
    );
    expect(auth.status).toBe(200);
    expect((await auth.json()).data.is_anonymous).toBe(false);

    const list = await request('/api/v1/admin/bug-reports?status=open', {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.data.length).toBeGreaterThanOrEqual(2);
    const anonItem = listBody.data.find((r: { id: string }) => r.id === anonBody.data.id);
    expect(anonItem.username).toBeNull();
    expect(anonItem.device_id).toBe('01JDDEVICEBUG000000000000');

    const contributorForbidden = await request('/api/v1/admin/bug-reports', {
      headers: { authorization: `Bearer ${contributorToken}` },
    });
    expect(contributorForbidden.status).toBe(403);

    const resolve = await post(
      `/api/v1/admin/bug-reports/${anonBody.data.id}/resolve`,
      { status: 'resolved', note: 'Sudah diperbaiki' },
      { authorization: `Bearer ${adminToken}` },
    );
    expect(resolve.status).toBe(200);
    expect((await resolve.json()).data.status).toBe('resolved');

    const again = await post(
      `/api/v1/admin/bug-reports/${anonBody.data.id}/resolve`,
      { status: 'rejected' },
      { authorization: `Bearer ${adminToken}` },
    );
    expect(again.status).toBe(404);
    expect((await again.json()).error_code).toBe('BUG_REPORT_NOT_FOUND');
  });
});

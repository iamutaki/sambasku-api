import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { ANONIM_EMAIL, ANONIM_USER_ID, ANONIM_USERNAME } from '@/shared/constants/anonim';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);

describe.skipIf(!hasTestDb)('Public profile E2E v1 - GET /users/:username (19 doc)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let reviewerUsername: string;
  let contributorUsername: string;

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  const post = (path: string, body: unknown) =>
    request(path, { method: 'POST', body: JSON.stringify(body) });

  const get = (path: string) => request(path);

  beforeAll(async () => {
    const { getTestDb } = await import('@/shared/database/drizzle/test-client');
    const { users, contributions, contributionReviews } = await import(
      '@/shared/database/drizzle/schema'
    );
    const db = getTestDb();
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    await truncateAll(db);

    await db.insert(users).values({
      id: ANONIM_USER_ID,
      username: ANONIM_USERNAME,
      email: ANONIM_EMAIL,
      passwordHash: 'bukan-hash-login',
      role: 'contributor',
    });

    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = Date.now();
    reviewerUsername = `rev${stamp}`;
    contributorUsername = `kon${stamp}`;

    const revRes = await post('/api/v1/auth/register', {
      name: reviewerUsername,
      email: `rev${stamp}@test.com`,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    const konRes = await post('/api/v1/auth/register', {
      name: contributorUsername,
      email: `kon${stamp}@test.com`,
      password: 'Password123',
      confirm_password: 'Password123',
    });
    const revBody = await revRes.json();
    const konBody = await konRes.json();
    const reviewerId = revBody.data.user_id as string;
    const contributorId = konBody.data.user_id as string;

    await db.update(users).set({ role: 'reviewer' }).where(eq(users.id, reviewerId));

    const contributionId = ulid26(`01E2ECON${stamp}`);
    await db.insert(contributions).values({
      id: contributionId,
      userId: contributorId,
      entityType: 'word',
      entityId: ulid26('01E2EWORDPROF'),
      action: 'create',
      status: 'approved',
    });
    await db.insert(contributionReviews).values({
      contributionId,
      reviewerId,
      status: 'approved',
    });
  });

  it('GET /api/v1/users/anonim → 200, is_verifier false, stats 0', async () => {
    const res = await get(`/api/v1/users/${ANONIM_USERNAME}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      username: 'anonim',
      role: 'contributor',
      is_verifier: false,
      stats: { contributions_approved: 0, verifications_done: 0, comments_published: 0 },
    });
    expect(body.data.joined_at).toBeTruthy();
    expect(body.data).toHaveProperty('avatar_url');
    expect(body.data).not.toHaveProperty('email');
    expect(body.data).not.toHaveProperty('phone');
  });

  it('GET reviewer → is_verifier true + verifications_done >= 1', async () => {
    const res = await get(`/api/v1/users/${reviewerUsername}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.username).toBe(reviewerUsername);
    expect(body.data.role).toBe('reviewer');
    expect(body.data.is_verifier).toBe(true);
    expect(body.data.stats.verifications_done).toBe(1);
    expect(body.data.stats.contributions_approved).toBe(0);
  });

  it('GET contributor → is_verifier false + contributions_approved >= 1', async () => {
    const res = await get(`/api/v1/users/${contributorUsername}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.is_verifier).toBe(false);
    expect(body.data.stats.contributions_approved).toBe(1);
  });

  it('GET username acak → 404 USER_NOT_FOUND', async () => {
    const res = await get('/api/v1/users/tidakada999');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error_code).toBe('USER_NOT_FOUND');
  });
});

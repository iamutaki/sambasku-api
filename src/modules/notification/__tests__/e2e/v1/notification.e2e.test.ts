import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01N2ELANGSMB');
const IDN = ulid26('01N2ELANGIDN');
const NOMINA = ulid26('01N2EWCNOMINA');

function validWordBody(lemma: string) {
  return {
    language_id: SMB,
    lemma,
    word_type: 'word',
    category_ids: [],
    related_words: [],
    meanings: [
      {
        word_class_id: NOMINA,
        definition: `definisi ${lemma}`,
        order_index: 1,
        translations: [
          { language_id: IDN, translation_text: `arti ${lemma}`, translation_type: 'direct' },
        ],
      },
    ],
    status: 'published',
  };
}

describe.skipIf(!hasTestDb)('Notification inbox E2E v1 (23-api-notifications.md)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;
  let otherToken: string;

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
    const { users, languages, wordClasses } = await import('@/shared/database/drizzle/schema');
    const { truncateAll } = await import('@/shared/database/drizzle/test-utils');
    const db = getTestDb();
    await truncateAll(db);
    await db.insert(languages).values([
      { id: SMB, code: 'smb', name: 'Sambas' },
      { id: IDN, code: 'id', name: 'Indonesia' },
    ]);
    await db.insert(wordClasses).values({ id: NOMINA, code: 'n', name: 'Nomina' });

    const appModule = await import('@/app');
    app = appModule.app;

    const stamp = Date.now();
    for (const [prefix, email, role] of [
      ['adm', `adm${stamp}@test.com`, 'admin'],
      ['kon', `kon${stamp}@test.com`, 'contributor'],
      ['oth', `oth${stamp}@test.com`, 'contributor'],
    ] as const) {
      await post('/api/v1/auth/register', {
        name: `${prefix}${stamp}`,
        email,
        password: 'Password123',
        confirm_password: 'Password123',
      });
      if (role !== 'contributor') {
        await db.update(users).set({ role }).where(eq(users.email, email));
      }
    }

    const login = async (email: string) =>
      (await (await post('/api/v1/auth/login', { email, password: 'Password123' })).json()).data
        .access_token;
    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);
    otherToken = await login(`oth${stamp}@test.com`);
  });

  it('approve → inbox kontributor; unread; mark read; orang lain 404', async () => {
    const create = await post('/api/v1/admin/words', validWordBody('makatn-inbox'), contributorToken);
    expect(create.status).toBe(201);
    const { data: created } = await create.json();

    const listAdmin = await get('/api/v1/admin/contributions?status=pending', adminToken);
    const item = (await listAdmin.json()).data.find(
      (c: { entity_id: string }) => c.entity_id === created.word_id,
    );
    expect(item).toBeTruthy();

    expect(
      (await post(`/api/v1/admin/contributions/${item.id}/approve`, { comment: 'ok' }, adminToken))
        .status,
    ).toBe(200);

    const unread = await get('/api/v1/notifications/unread-count', contributorToken);
    expect(unread.status).toBe(200);
    expect((await unread.json()).data.unread_count).toBe(1);

    const list = await get('/api/v1/notifications?limit=20', contributorToken);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({
      type: 'contribution_approved',
      target_kind: 'contribution',
      target_id: item.id,
      read_at: null,
    });
    expect(listBody.meta).toMatchObject({ limit: 20, has_more: false });

    const notifId = listBody.data[0].id;
    const stolen = await post(`/api/v1/notifications/${notifId}/read`, {}, otherToken);
    expect(stolen.status).toBe(404);
    expect((await stolen.json()).error_code).toBe('NOTIFICATION_NOT_FOUND');

    const mark = await post(`/api/v1/notifications/${notifId}/read`, {}, contributorToken);
    expect(mark.status).toBe(200);
    expect((await mark.json()).data.already_read).toBe(false);

    const markAgain = await post(`/api/v1/notifications/${notifId}/read`, {}, contributorToken);
    expect(markAgain.status).toBe(200);
    expect((await markAgain.json()).data.already_read).toBe(true);

    const unreadAfter = await get('/api/v1/notifications/unread-count', contributorToken);
    expect((await unreadAfter.json()).data.unread_count).toBe(0);
  });

  it('tanpa token → 401', async () => {
    expect((await get('/api/v1/notifications')).status).toBe(401);
    expect((await get('/api/v1/notifications/unread-count')).status).toBe(401);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { ANONIM_EMAIL, ANONIM_USER_ID, ANONIM_USERNAME } from '@/shared/constants/anonim';

// Pastikan .env.test (DB test) dipakai SEBELUM app di-import (Section 10)
const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;
if (parsed?.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01E2ELANGSMB');
const IDN = ulid26('01E2ELANGIDN');
const NOMINA = ulid26('01E2EWCNOMINA');

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

describe.skipIf(!hasTestDb)('Contribution E2E v1 - antrean review (Section 22 approval gate)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let adminToken: string;
  let contributorToken: string;

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
    ] as const) {
      await post('/api/v1/auth/register', {
        username: `${prefix}${stamp}`,
        email,
        password: 'Password123',
        confirm_password: 'Password123',
      });
      if (role !== 'contributor') {
        await db.update(users).set({ role }).where(eq(users.email, email));
      }
    }

    // User sistem Anonim - penampung kontribusi tanpa login (03 doc)
    await db.insert(users).values({
      id: ANONIM_USER_ID,
      username: ANONIM_USERNAME,
      email: ANONIM_EMAIL,
      passwordHash: 'bukan-hash-login',
      role: 'contributor',
    });
    const login = async (email: string) =>
      (await (await post('/api/v1/auth/login', { email, password: 'Password123' })).json()).data.access_token;
    adminToken = await login(`adm${stamp}@test.com`);
    contributorToken = await login(`kon${stamp}@test.com`);
  });

  it('alur penuh: contributor submit → antrean pending → detail → approve → tayang + terverifikasi', async () => {
    // 1. Contributor submit → pending_review, tidak tayang
    const create = await post('/api/v1/admin/words', validWordBody('kalintiak'), contributorToken);
    expect(create.status).toBe(201);
    const { data: created } = await create.json();
    expect(created.status).toBe('pending_review');
    expect((await get(`/api/v1/words/${created.word_id}`)).status).toBe(404);

    // 2. Muncul di antrean admin (status pending)
    const list = await get('/api/v1/admin/contributions?status=pending&entity_type=word', adminToken);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    const item = listBody.data.find(
      (c: { entity_id: string }) => c.entity_id === created.word_id,
    );
    expect(item).toMatchObject({ entity_type: 'word', status: 'pending' });
    expect(typeof item.contributor_username).toBe('string');
    expect(listBody.meta).toMatchObject({ limit: 20, has_more: false });

    // 3. Detail untuk layar review - payload entity utuh (semua status)
    const detail = await get(`/api/v1/admin/contributions/${item.id}`, adminToken);
    const detailBody = await detail.json();
    expect(detailBody.data.contribution.id).toBe(item.id);
    expect(detailBody.data.review).toBeNull();
    expect(detailBody.data.entity).toMatchObject({ lemma: 'kalintiak', status: 'pending_review' });

    // 4. Approve → kata tayang + is_verified true
    const approve = await post(`/api/v1/admin/contributions/${item.id}/approve`, { comment: 'valid' }, adminToken);
    expect(approve.status).toBe(200);
    const approveBody = await approve.json();
    expect(approveBody.data).toMatchObject({ status: 'approved', entity_type: 'word' });

    const publik = await get(`/api/v1/words/${created.word_id}`);
    expect(publik.status).toBe(200);
    const publikBody = await publik.json();
    expect(publikBody.data.is_verified).toBe(true);
    expect(typeof publikBody.data.verified_at).toBe('string');
  });

  it('approve ulang → 409 CONTRIBUTION_ALREADY_REVIEWED', async () => {
    const create = await post('/api/v1/admin/words', validWordBody('double-review'), contributorToken);
    const { data } = await create.json();
    const list = await get('/api/v1/admin/contributions?status=pending', adminToken);
    const item = (await list.json()).data.find((c: { entity_id: string }) => c.entity_id === data.word_id);

    expect((await post(`/api/v1/admin/contributions/${item.id}/approve`, {}, adminToken)).status).toBe(200);
    const again = await post(`/api/v1/admin/contributions/${item.id}/approve`, {}, adminToken);
    expect(again.status).toBe(409);
    expect((await again.json()).error_code).toBe('CONTRIBUTION_ALREADY_REVIEWED');
  });

  it('reject: comment wajib; entity rejected tidak tayang', async () => {
    const create = await post('/api/v1/admin/words', validWordBody('ditolak'), contributorToken);
    const { data } = await create.json();
    const list = await get('/api/v1/admin/contributions?status=pending', adminToken);
    const item = (await list.json()).data.find((c: { entity_id: string }) => c.entity_id === data.word_id);

    // tanpa comment → 400
    const noComment = await post(`/api/v1/admin/contributions/${item.id}/reject`, { comment: '' }, adminToken);
    expect(noComment.status).toBe(400);

    const reject = await post(
      `/api/v1/admin/contributions/${item.id}/reject`,
      { comment: 'bukan kosakata Sambas' },
      adminToken,
    );
    expect(reject.status).toBe(200);
    expect((await reject.json()).data.status).toBe('rejected');
    expect((await get(`/api/v1/words/${data.word_id}`)).status).toBe(404);
  });

  it('contributor tidak boleh akses antrean → 403; id ngawur → 404', async () => {
    expect((await get('/api/v1/admin/contributions', contributorToken)).status).toBe(403);
    const bogus = await post(`/api/v1/admin/contributions/${ulid26('01E2ENGACAK')}/approve`, {}, adminToken);
    expect(bogus.status).toBe(404);
    expect((await bogus.json()).error_code).toBe('CONTRIBUTION_NOT_FOUND');
  });

  it('ANONIM: submit kata TANPA login → 201 pending_review, atribusi ke user Anonim', async () => {
    // endpoint publik /api/v1/contributions/words - tanpa token sama sekali
    const res = await post('/api/v1/contributions/words', validWordBody('kata dari anonim'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe('pending_review');
    expect(body.data.is_verified).toBe(false);

    // antrean admin: kontribusi ini tercatat atas nama user Anonim
    const list = await get('/api/v1/admin/contributions?status=pending&entity_type=word', adminToken);
    const listBody = await list.json();
    const item = listBody.data.find((c: { entity_id: string }) => c.entity_id === body.data.word_id);
    expect(item).toMatchObject({ contributor_username: 'anonim', status: 'pending' });

    // dan tidak tayang sampai di-approve
    expect((await get(`/api/v1/words/${body.data.word_id}`)).status).toBe(404);
  });

  // ---- 06-api-x-device-id.md: dual-bucket X-Device-Id + IP ----

  it('06: 5 submit per X-Device-Id → ke-6 429 (Retry-After); device baru di IP sama → lolos', async () => {
    // IP unik per test supaya bucket IP tidak bocor antar test
    const ip = `10.6.${Date.now() % 250}.7`;
    const dev = `01DEV${String(Date.now()).padEnd(21, '0')}`;
    const submit = () =>
      request('/api/v1/contributions/words', {
        method: 'POST',
        body: JSON.stringify(validWordBody(`dev limit ${Date.now()}`)),
        headers: { 'x-forwarded-for': ip, 'x-device-id': dev },
      });

    for (let i = 0; i < 5; i++) {
      expect((await submit()).status).toBe(201);
    }
    const sixth = await submit();
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error_code).toBe('RATE_LIMITED');
    expect(sixth.headers.get('retry-after')).toEqual(expect.any(String));

    // device BERBEDA dari IP yang sama → bucket sendiri, tetap bisa submit
    const dev2 = `01DEV${String(Date.now() + 1).padEnd(21, '0')}`;
    const res = await request('/api/v1/contributions/words', {
      method: 'POST',
      body: JSON.stringify(validWordBody(`dev baru ${Date.now()}`)),
      headers: { 'x-forwarded-for': ip, 'x-device-id': dev2 },
    });
    expect(res.status).toBe(201);
  });

  it('06: tanpa X-Device-Id → TIDAK kena limit 5/jam (hanya langit-langit IP 20)', async () => {
    const ip = `10.7.${Date.now() % 250}.9`;
    for (let i = 0; i < 6; i++) {
      const res = await request('/api/v1/contributions/words', {
        method: 'POST',
        body: JSON.stringify(validWordBody(`tanpa dev ${i} ${Date.now()}`)),
        headers: { 'x-forwarded-for': ip }, // tanpa x-device-id
      });
      expect(res.status).toBe(201); // 6 > 5: bukti bucket device tidak aktif
    }
  });

  it('correct contoh kalimat → is_corrected true + tayang; entity_type salah → 400', async () => {
    // kata published dari admin + contoh pending dari contributor
    const create = await post('/api/v1/admin/words', validWordBody('kata contoh'), adminToken);
    const { data } = await create.json();
    const detail = await get(`/api/v1/words/${data.word_id}`);
    const meaningId = (await detail.json()).data.meanings[0].id;

    const add = await post(
      `/api/v1/meanings/${meaningId}/examples`,
      { source_language_id: SMB, source_sentence: 'Kami makatn kalintiak.', target_language_id: IDN, target_sentence: 'Kami makan ikan kecil.' },
      contributorToken,
    );
    expect(add.status).toBe(201);
    const added = (await add.json()).data;
    expect(added.status).toBe('pending_review');

    const list = await get('/api/v1/admin/contributions?status=pending&entity_type=example', adminToken);
    const item = (await list.json()).data.find((c: { entity_id: string }) => c.entity_id === added.id);

    // entity_type tidak cocok → 400
    const wrongType = await post(
      `/api/v1/admin/contributions/${item.id}/correct`,
      { entity_type: 'pronunciation', notation: 'ipa', value: '/x/' },
      adminToken,
    );
    expect(wrongType.status).toBe(400);

    // koreksi ejaan lalu setujui
    const correct = await post(
      `/api/v1/admin/contributions/${item.id}/correct`,
      { entity_type: 'example', comment: 'perbaiki ejaan', source_sentence: 'Kami makatn kalintiak.' },
      adminToken,
    );
    expect(correct.status).toBe(200);
    expect((await correct.json()).data).toMatchObject({ status: 'corrected', is_corrected: true });

    // contoh kini tayang di detail publik
    const after = await get(`/api/v1/words/${data.word_id}`);
    const afterBody = await after.json();
    expect(afterBody.data.meanings[0].examples.some(
      (e: { source_sentence: string }) => e.source_sentence === 'Kami makatn kalintiak.',
    )).toBe(true);
  });

  it('correct publish=false → koreksi saja: kontribusi tetap pending & belum tayang', async () => {
    const create = await post('/api/v1/admin/words', validWordBody('kata koreksi tunda'), adminToken);
    const { data } = await create.json();
    const detail = await get(`/api/v1/words/${data.word_id}`);
    const meaningId = (await detail.json()).data.meanings[0].id;

    const add = await post(
      `/api/v1/meanings/${meaningId}/examples`,
      { source_language_id: SMB, source_sentence: 'Salah ejaan.', target_language_id: IDN, target_sentence: 'Salah.' },
      contributorToken,
    );
    const added = (await add.json()).data;

    const list = await get('/api/v1/admin/contributions?status=pending&entity_type=example', adminToken);
    const item = (await list.json()).data.find((c: { entity_id: string }) => c.entity_id === added.id);

    const correct = await post(
      `/api/v1/admin/contributions/${item.id}/correct`,
      { entity_type: 'example', publish: false, source_sentence: 'Sudah diperbaiki.' },
      adminToken,
    );
    expect(correct.status).toBe(200);
    expect((await correct.json()).data).toMatchObject({ status: 'pending', is_corrected: true });

    // kontribusi masih di antrean pending
    const stillPending = await get('/api/v1/admin/contributions?status=pending&entity_type=example', adminToken);
    expect((await stillPending.json()).data.some((c: { id: string }) => c.id === item.id)).toBe(true);

    // contoh belum tayang di detail publik
    const after = await get(`/api/v1/words/${data.word_id}`);
    const afterBody = await after.json();
    expect(afterBody.data.meanings[0].examples.some(
      (e: { source_sentence: string }) => e.source_sentence === 'Sudah diperbaiki.',
    )).toBe(false);
  });
});

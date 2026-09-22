import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { getTestDb } from '@/shared/database/drizzle/test-client';
import { languages, users, words } from '@/shared/database/drizzle/schema';
import { truncateAll } from '@/shared/database/drizzle/test-utils';
import { CommentRepositoryImpl } from '../../infrastructure/comment.repository.impl';

const { parsed } = config({ path: '.env.test', quiet: true });
const hasTestDb = !!parsed?.DATABASE_URL;

const ulid26 = (prefix: string) => prefix.padEnd(26, '0').slice(0, 26);
const SMB = ulid26('01TESTLANGSMB');
const AUTHOR = ulid26('01TESTCMAUTHOR');
const OTHER = ulid26('01TESTCMOTHER');
const ADMIN = ulid26('01TESTCMADMIN');
const WORD = ulid26('01TESTCMWORD');
const WORD2 = ulid26('01TESTCMWORTWO');

describe.skipIf(!hasTestDb)('CommentRepositoryImpl (integration, post-moderation)', () => {
  const repo = new CommentRepositoryImpl(getTestDb());

  beforeEach(async () => {
    const db = getTestDb();
    await truncateAll(db);
    await db.insert(languages).values({ id: SMB, code: 'smb', name: 'Sambas' });
    await db.insert(users).values([
      { id: AUTHOR, email: 'cmauthor@test.com', username: 'cmauthor' },
      { id: OTHER, email: 'cmother@test.com', username: 'cmother' },
      { id: ADMIN, email: 'cmadmin@test.com', username: 'cmadmin' },
    ]);
    await db.insert(words).values([
      { id: WORD, languageId: SMB, lemma: 'makatn' },
      { id: WORD2, languageId: SMB, lemma: 'ngamakn' },
    ]);
  });

  it('create langsung published; listByWord include taken_down & deleted_by_author', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'pertama' });
    expect(a.status).toBe('published');
    const b = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'kedua' });
    await repo.takedown(b.id, ADMIN);
    const c = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'ketiga' });
    await repo.markDeletedByAuthor(c.id, AUTHOR);
    const purged = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'purge' });
    await repo.softDelete(purged.id, ADMIN);

    const page = await repo.listByWord(WORD, { limit: 20 });
    expect(page.items.map((cm) => cm.body).sort()).toEqual(['kedua', 'ketiga', 'pertama']);
    expect(page.items.find((cm) => cm.id === a.id)?.status).toBe('published');
    expect(page.items.find((cm) => cm.id === b.id)?.status).toBe('taken_down');
    expect(page.items.find((cm) => cm.id === c.id)?.status).toBe('deleted_by_author');
  });

  it('takedown: hanya published; race → false', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'sekali' });
    expect(await repo.takedown(a.id, ADMIN)).toBe(true);
    expect(await repo.takedown(a.id, ADMIN)).toBe(false);
  });

  it('listByUser: semua status kecuali soft-delete', async () => {
    const published = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'tayang' });
    const taken = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'takedown' });
    await repo.takedown(taken.id, ADMIN);
    const removed = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'dihapus' });
    await repo.softDelete(removed.id, AUTHOR);
    await repo.create({ wordId: WORD, userId: OTHER, body: 'punya orang' });

    const mine = await repo.listByUser({ userId: AUTHOR, limit: 20 });
    expect(mine.items.map((cm) => cm.body).sort()).toEqual(['takedown', 'tayang']);
    expect(mine.items.find((cm) => cm.id === published.id)?.status).toBe('published');

    const onlyTaken = await repo.listByUser({ userId: AUTHOR, limit: 20, status: 'taken_down' });
    expect(onlyTaken.items.map((cm) => cm.body)).toEqual(['takedown']);

    const others = await repo.listByUser({ userId: OTHER, limit: 20 });
    expect(others.items.map((cm) => cm.body)).toEqual(['punya orang']);

    const db = getTestDb();
    await db.update(words).set({ deletedAt: new Date() }).where(eq(words.id, WORD2));
    const onGone = await repo.create({ wordId: WORD2, userId: AUTHOR, body: 'kata hilang' });
    const withGone = await repo.listByUser({ userId: AUTHOR, limit: 1 });
    expect(withGone.hasMore).toBe(true);
    expect(withGone.items[0].id).toBe(onGone.id);
    expect(withGone.items[0].wordLemma).toBeNull();
  });

  it('listAdmin filter status + word_id', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'kata satu' });
    await repo.create({ wordId: WORD2, userId: AUTHOR, body: 'kata lain' });
    await repo.takedown(a.id, ADMIN);

    const taken = await repo.listAdmin({ status: 'taken_down', limit: 20 });
    expect(taken.items.map((cm) => cm.body)).toEqual(['kata satu']);

    const ofWord = await repo.listAdmin({ wordId: WORD, limit: 20 });
    expect(ofWord.items).toHaveLength(1);
  });

  it('softDelete: hilang dari findById', async () => {
    const a = await repo.create({ wordId: WORD, userId: AUTHOR, body: 'mau dihapus' });
    expect(await repo.softDelete(a.id, AUTHOR)).toBe(true);
    expect(await repo.findById(a.id)).toBeNull();
    expect(await repo.takedown(a.id, ADMIN)).toBe(false);
  });
});

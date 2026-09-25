import { describe, expect, it, vi } from 'vitest';
import { publishOrMergeMeaningsInTx } from '../../infrastructure/publish-or-merge-meanings';

/** Stub Drizzle-like chain: await chain → rows. */
function selectChain(rows: unknown[]) {
  const terminal = Promise.resolve(rows);
  const self: Record<string, unknown> = {};
  const passthrough = () => self;
  self.from = passthrough;
  self.where = passthrough;
  self.orderBy = passthrough;
  self.limit = () => terminal;
  self.then = terminal.then.bind(terminal);
  return self;
}

describe('publishOrMergeMeaningsInTx', () => {
  it('return null kalau kata tidak ada', async () => {
    const tx = {
      select: () => selectChain([]),
    };
    const result = await publishOrMergeMeaningsInTx(tx, '01MISSING', '01ACTOR');
    expect(result).toBeNull();
  });

  it('kata soft-deleted tanpa twin published → null', async () => {
    const softDeleted = {
      id: '01SRC',
      languageId: '01LANG',
      lemma: 'lading',
      deletedAt: new Date(),
      isVerified: false,
      verifiedBy: null,
    };
    let n = 0;
    const tx = {
      select: () => {
        n += 1;
        return selectChain(n === 1 ? [softDeleted] : []);
      },
    };
    const result = await publishOrMergeMeaningsInTx(tx, '01SRC', '01ACTOR');
    expect(result).toBeNull();
  });

  it('kata soft-deleted + twin published → merge result (orphan pending)', async () => {
    const softDeleted = {
      id: '01SRC',
      languageId: '01LANG',
      lemma: 'lading',
      deletedAt: new Date(),
      isVerified: false,
      verifiedBy: null,
    };
    const twin = { id: '01TWIN' };
    let n = 0;
    const tx = {
      select: () => {
        n += 1;
        if (n === 1) return selectChain([softDeleted]);
        if (n === 2) return selectChain([twin]);
        // max orderIndex + source meanings (kosong)
        return selectChain(n === 3 ? [{ max: -1 }] : []);
      },
      update: vi.fn(() => ({
        set: () => ({
          where: async () => undefined,
        }),
      })),
    };

    const result = await publishOrMergeMeaningsInTx(tx, '01SRC', '01ACTOR');
    expect(result).toEqual({ wordId: '01TWIN', mergedIntoWordId: '01TWIN' });
  });
});

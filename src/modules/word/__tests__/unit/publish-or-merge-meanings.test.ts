import { describe, expect, it } from 'vitest';
import { publishOrMergeMeaningsInTx } from '../../infrastructure/publish-or-merge-meanings';

/** ponytail: kontrak null-path; merge penuh di integration contribution. */
describe('publishOrMergeMeaningsInTx', () => {
  it('return null kalau kata tidak ada', async () => {
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    };
    const result = await publishOrMergeMeaningsInTx(tx, '01MISSING', '01ACTOR');
    expect(result).toBeNull();
  });
});

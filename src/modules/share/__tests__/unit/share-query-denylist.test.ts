import { describe, expect, it } from 'vitest';
import { isBlockedShareQuery } from '../../application/utils/share-query-denylist';

describe('isBlockedShareQuery', () => {
  it('blok token NSFW', () => {
    expect(isBlockedShareQuery('nude beach')).toBe(true);
    expect(isBlockedShareQuery('foto bugil')).toBe(true);
    expect(isBlockedShareQuery('NSFW art')).toBe(true);
  });

  it('izinkan query biasa', () => {
    expect(isBlockedShareQuery('makan makanan')).toBe(false);
    expect(isBlockedShareQuery('nature indonesia')).toBe(false);
  });
});

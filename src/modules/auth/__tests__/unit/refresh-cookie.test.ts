import { describe, it, expect } from 'vitest';
import { getAllCookieValues } from '../../presentation/v1/parse-cookie-values';

describe('getAllCookieValues', () => {
  it('mengembalikan semua nilai nama cookie yang sama (urutan header)', () => {
    const header =
      'refresh_token=token-lama-host; refresh_token=token-baru-domain; other=1';
    expect(getAllCookieValues(header, 'refresh_token')).toEqual([
      'token-lama-host',
      'token-baru-domain',
    ]);
  });

  it('dedupe nilai identik', () => {
    expect(
      getAllCookieValues('refresh_token=sama; refresh_token=sama', 'refresh_token'),
    ).toEqual(['sama']);
  });

  it('header kosong / null → []', () => {
    expect(getAllCookieValues(null, 'refresh_token')).toEqual([]);
    expect(getAllCookieValues('', 'refresh_token')).toEqual([]);
  });
});

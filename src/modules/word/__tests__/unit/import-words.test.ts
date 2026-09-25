import { describe, expect, it } from 'vitest';
import { decideImportPublication, meaningFingerprint } from '../../application/import-words';

describe('decideImportPublication', () => {
  it('centang tayang saja menayangkan tanpa verifikasi', () => {
    expect(decideImportPublication({ verify: true, verified: false, role: 'admin', parentStatus: null })).toEqual({
      status: 'published',
      isVerified: false,
      forcedDraft: false,
    });
  });

  it('tayang dan terverifikasi menandai kata terverifikasi', () => {
    expect(decideImportPublication({ verify: true, verified: true, role: 'reviewer', parentStatus: null })).toEqual({
      status: 'published',
      isVerified: true,
      forcedDraft: false,
    });
  });

  it('tanpa centang tayang tetap draf meski terverifikasi dicentang', () => {
    const result = decideImportPublication({ verify: false, verified: true, role: 'reviewer', parentStatus: null });
    expect(result.status).toBe('draft');
    expect(result.isVerified).toBe(false);
  });

  it('editor tidak bisa menayangkan atau memverifikasi', () => {
    expect(decideImportPublication({ verify: true, verified: true, role: 'editor', parentStatus: null })).toEqual({
      status: 'draft',
      isVerified: false,
      forcedDraft: false,
    });
  });

  it('induk belum tayang memaksa makna baru jadi draf', () => {
    expect(decideImportPublication({ verify: true, verified: true, role: 'admin', parentStatus: 'draft' })).toMatchObject({
      status: 'draft',
      isVerified: false,
      forcedDraft: true,
    });
    expect(
      decideImportPublication({ verify: true, verified: true, role: 'admin', parentStatus: 'taken_down' }).forcedDraft,
    ).toBe(true);
  });
});

describe('meaningFingerprint', () => {
  it('mengabaikan huruf besar dan definisi kosong', () => {
    expect(meaningFingerprint({ definition: ' Makan ', translation: 'makan', isHaveDefinition: true, isHaveTranslation: true }))
      .toBe(meaningFingerprint({ definition: 'makan', translation: 'Makan' }));
    expect(meaningFingerprint({ definition: '-', translation: 'makan', isHaveDefinition: false, isHaveTranslation: true }))
      .toBe('\nmakan');
  });
});

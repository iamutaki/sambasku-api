import { describe, expect, it } from 'vitest';
import { decideImportPublication, meaningFingerprint } from '../../application/import-words';

describe('decideImportPublication', () => {
  it('verifikator yang mencentang membuat kata tayang', () => {
    expect(decideImportPublication({ verify: true, role: 'admin', parentStatus: null })).toEqual({
      status: 'published',
      isVerified: true,
      forcedDraft: false,
    });
  });

  it('tanpa centang tetap draf', () => {
    expect(decideImportPublication({ verify: false, role: 'reviewer', parentStatus: null }).status).toBe('draft');
  });

  it('editor tidak bisa memverifikasi', () => {
    expect(decideImportPublication({ verify: true, role: 'editor', parentStatus: null }).isVerified).toBe(false);
  });

  it('induk belum tayang memaksa makna baru jadi draf', () => {
    expect(decideImportPublication({ verify: true, role: 'admin', parentStatus: 'draft' })).toMatchObject({
      status: 'draft',
      forcedDraft: true,
    });
    expect(decideImportPublication({ verify: true, role: 'admin', parentStatus: 'taken_down' }).forcedDraft).toBe(true);
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

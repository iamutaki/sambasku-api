import { describe, expect, it } from 'vitest';
import { normalizeBlocklistWords } from '../../application/utils/normalize-blocklist-words';

describe('normalizeBlocklistWords', () => {
  it('trim, lowercase, dan buang token kosong', () => {
    const result = normalizeBlocklistWords([' Lorem ', '', '  ', 'IPSUM', ' dolo']);
    expect(result.words).toEqual(['lorem', 'ipsum', 'dolo']);
    expect(result.duplicateInBatch).toBe(0);
    expect(result.invalidCount).toBe(0);
  });

  it('duplikat di batch yang sama dihitung terpisah dari kata unik', () => {
    const result = normalizeBlocklistWords(['Lorem', 'lorem', 'LOREM']);
    expect(result.words).toEqual(['lorem']);
    expect(result.duplicateInBatch).toBe(2);
  });

  it('kata lebih dari 100 karakter tidak masuk daftar', () => {
    const result = normalizeBlocklistWords(['ok', 'x'.repeat(101)]);
    expect(result.words).toEqual(['ok']);
    expect(result.invalidCount).toBe(1);
  });
});

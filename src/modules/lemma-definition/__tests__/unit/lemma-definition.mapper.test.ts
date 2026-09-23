import { describe, it, expect } from 'vitest';
import {
  expandExamplePlaceholders,
  mapProviderLemmaToLookupResult,
  normalizeLemmaQuery,
  parseHomonymIndex,
} from '../../application/lemma-definition.mapper';
import type { ProviderLemmaRaw } from '../../application/ports/lemma-definition-provider.port';

describe('lemma-definition.mapper', () => {
  it('normalizeLemmaQuery: trim + collapse space + lower', () => {
    expect(normalizeLemmaQuery('  MaKan  ')).toBe('makan');
    expect(normalizeLemmaQuery('kata  dasar')).toBe('kata dasar');
  });

  it('parseHomonymIndex dari label entry provider', () => {
    expect(parseHomonymIndex('a.pel (2)', 99)).toBe(2);
    expect(parseHomonymIndex('ma.kan (1)', 99)).toBe(1);
    expect(parseHomonymIndex('a.pel', 3)).toBe(3);
  });

  it('expandExamplePlaceholders mengganti -- dengan lemma', () => {
    expect(expandExamplePlaceholders('mereka -- tiga kali sehari', 'makan')).toBe(
      'mereka makan tiga kali sehari',
    );
  });

  it('map: multi-sense + kelas kata + notes non-kelas + suggestions derived', () => {
    const raw: ProviderLemmaRaw = {
      lemma: 'makan',
      entries: [
        {
          entry: 'ma.kan (1)',
          definitions: [
            {
              definition: 'memasukkan makanan ke mulut',
              labels: [
                { code: 'v', name: 'Verba', kind: 'Kelas Kata' },
                { code: 'ki', name: 'Kiasan', kind: 'Kiasan' },
              ],
              usageExamples: ['ia -- nasi'],
            },
            {
              definition: 'menghabiskan biaya',
              labels: [{ code: 'v', name: 'Verba', kind: 'Kelas Kata' }],
              usageExamples: [],
            },
          ],
        },
      ],
    };

    const result = mapProviderLemmaToLookupResult({
      query: 'Makan',
      normalizedQuery: 'makan',
      providerName: 'kbbi',
      fetchedAt: new Date('2026-09-19T00:00:00.000Z'),
      cacheHit: false,
      raw,
    });

    expect(result.found).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.homonym_index).toBe(1);
    expect(result.entries[0]!.senses).toHaveLength(2);
    expect(result.entries[0]!.senses[0]).toMatchObject({
      word_class_code: 'v',
      word_class_label: 'Verba',
      notes: 'Kiasan',
      examples: ['ia makan nasi'],
    });
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]!.id).toBe('1:1');
    expect(result.suggestions[0]!.definition).toBe('memasukkan makanan ke mulut');
    expect(result.suggestions[1]!.id).toBe('1:2');
  });

  it('map: multi-homonym dari beberapa entries', () => {
    const raw: ProviderLemmaRaw = {
      lemma: 'apel',
      entries: [
        {
          entry: 'a.pel (1)',
          definitions: [{ definition: 'upacara', labels: [{ code: 'n', name: 'Nomina', kind: 'Kelas Kata' }] }],
        },
        {
          entry: 'a.pel (2)',
          definitions: [
            { definition: 'buah', labels: [{ code: 'n', name: 'Nomina', kind: 'Kelas Kata' }] },
            { definition: 'warna merah', labels: [{ code: 'n', name: 'Nomina', kind: 'Kelas Kata' }] },
          ],
        },
      ],
    };

    const result = mapProviderLemmaToLookupResult({
      query: 'apel',
      normalizedQuery: 'apel',
      providerName: 'kbbi',
      fetchedAt: new Date(),
      cacheHit: false,
      raw,
    });

    expect(result.entries.map((e) => e.homonym_index)).toEqual([1, 2]);
    expect(result.suggestions.map((s) => s.id)).toEqual(['1:1', '2:1', '2:2']);
  });

  it('map: referencedLemma tanpa definition → lihat X', () => {
    const raw: ProviderLemmaRaw = {
      lemma: 'x',
      entries: [
        {
          entry: 'x',
          definitions: [{ definition: '', referencedLemma: 'y', labels: [] }],
        },
      ],
    };
    const result = mapProviderLemmaToLookupResult({
      query: 'x',
      normalizedQuery: 'x',
      providerName: 'kbbi',
      fetchedAt: new Date(),
      cacheHit: false,
      raw,
    });
    expect(result.suggestions[0]!.definition).toBe('lihat y');
  });

  it('map: null / prakategorial tanpa definisi → found false', () => {
    expect(
      mapProviderLemmaToLookupResult({
        query: 'z',
        normalizedQuery: 'z',
        providerName: 'kbbi',
        fetchedAt: new Date(),
        cacheHit: false,
        raw: null,
      }).found,
    ).toBe(false);

    const empty: ProviderLemmaRaw = {
      lemma: 'acu',
      entries: [{ entry: 'a.cu (1)', definitions: [], isPrecategorical: true }],
    };
    const result = mapProviderLemmaToLookupResult({
      query: 'acu',
      normalizedQuery: 'acu',
      providerName: 'kbbi',
      fetchedAt: new Date(),
      cacheHit: false,
      raw: empty,
    });
    expect(result.found).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });
});

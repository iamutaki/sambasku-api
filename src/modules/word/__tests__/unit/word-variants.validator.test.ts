import { describe, it, expect } from 'vitest';
import { createWordSchema } from '../../presentation/v1/validators/create-word.validator';
import { updateWordSchema } from '../../presentation/v1/validators/update-word.validator';

// 11-api-variasi-penulisan.md - aturan variasi: ejaan alternatif tanpa
// afiks, form ≠ lemma (root), dedup (form + dialek). TANPA akses DB.

const ULID = (s: string) => s.padEnd(26, '0');

function build(overrides: Record<string, unknown> = {}) {
  return {
    language_id: ULID('01LANGSMB'),
    lemma: 'ketek',
    meanings: [
      {
        word_class_id: ULID('01WCNOMINA'),
        definition: 'Bekas tangkal kayu',
        order_index: 1,
        translations: [
          { language_id: ULID('01LANGIDN'), translation_text: 'ketek', translation_type: 'direct' },
        ],
      },
    ],
    word_type: 'word',
    category_ids: [],
    related_words: [],
    status: 'published',
    ...overrides,
  };
}

const variant = (form: string, extra: Record<string, unknown> = {}) => ({
  form,
  variant_type: 'alternative',
  ...extra,
});

describe('createWordSchema - variasi penulisan (11)', () => {
  it('tiga ejaan alternatif ketek (ketex, kettek, kete\') → valid', () => {
    const result = createWordSchema.safeParse(
      build({ variants: [variant('ketex'), variant('kettek'), variant("kete'")] }),
    );
    expect(result.success).toBe(true);
  });

  it('variasi sama persis dengan lemma (case-insensitive) → error di item', () => {
    const result = createWordSchema.safeParse(build({ variants: [variant('KeTeK')] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('variants.0.form');
    }
  });

  it('ejaan alternatif memakai afiks → error (alternative tanpa afiks)', () => {
    const result = createWordSchema.safeParse(
      build({ variants: [variant('ketex', { affix_type: 'suffix', affix_value: '-x' })] }),
    );
    expect(result.success).toBe(false);
  });

  it('duplikat (form + dialek sama) antar-item → error, beda dialek → valid', () => {
    const dup = createWordSchema.safeParse(build({ variants: [variant('ketex'), variant('Ketex')] }));
    expect(dup.success).toBe(false);

    const bedaDialek = createWordSchema.safeParse(
      build({
        variants: [variant('ketex'), variant('ketex', { dialect_id: ULID('01DIALPADU') })],
      }),
    );
    expect(bedaDialek.success).toBe(true);
  });

  it('tipe derivation dengan afiks lengkap tetap valid (regresi)', () => {
    const result = createWordSchema.safeParse(
      build({
        variants: [variant('naketek', { variant_type: 'derivation', affix_type: 'prefix', affix_value: 'na-' })],
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe('updateWordSchema - variasi penulisan (11, turunan schema)', () => {
  it('variasi = lemma → error (refine root ikut di update)', () => {
    const result = updateWordSchema.safeParse(build({ variants: [variant('ketek')] }));
    expect(result.success).toBe(false);
  });

  it('variasi valid → lolos', () => {
    const result = updateWordSchema.safeParse(build({ variants: [variant('ketex')] }));
    expect(result.success).toBe(true);
  });
});

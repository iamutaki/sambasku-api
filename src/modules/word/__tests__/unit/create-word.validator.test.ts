import { describe, it, expect } from 'vitest';
import { createWordSchema } from '../../presentation/v1/validators/create-word.validator';

// 04-api-sinonim-inline.md - validasi related_words union (Form A link |
// Form B inline), inherit semantics & aturan silang induk↔inline.
// Semua pengujian TANPA akses DB - murni schema (resolve di use case).

const ULID = (s: string) => s.padEnd(26, '0');

function build(overrides: Record<string, unknown> = {}) {
  return {
    language_id: ULID('01LANGSMB'),
    lemma: 'makatn',
    meanings: [
      {
        word_class_id: ULID('01WCNOMINA'),
        definition: 'Aktivitas memasukkan makanan ke mulut',
        order_index: 1,
        translations: [
          { language_id: ULID('01LANGIDN'), translation_text: 'makan', translation_type: 'direct' },
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

const FORM_A = { relation_type: 'synonym', word_id: ULID('01WORDPADU') };
const FORM_B = { relation_type: 'synonym', word: { lemma: 'ngamakn' } };

describe('createWordSchema - related_words dua bentuk (04)', () => {
  it('Form A (link kata existing) tetap valid - regresi 01', () => {
    const result = createWordSchema.safeParse(build({ related_words: [FORM_A] }));
    expect(result.success).toBe(true);
  });

  it('Form B (kata inline) valid dengan default inherit_meanings=true', () => {
    const result = createWordSchema.safeParse(build({ related_words: [FORM_B] }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.related_words[0]).toMatchObject({
        relation_type: 'synonym',
        word: { lemma: 'ngamakn', inherit_meanings: true },
      });
      expect('word_id' in result.data.related_words[0]).toBe(false);
    }
  });

  it('campuran Form A + Form B dalam satu request → valid', () => {
    const result = createWordSchema.safeParse(
      build({ related_words: [FORM_A, FORM_B, { relation_type: 'antonym', word: { lemma: 'lapa' } }] }),
    );
    expect(result.success).toBe(true);
  });

  it('word_id + word diisi bersamaan → VALIDATION_ERROR (pilih salah satu bentuk)', () => {
    const result = createWordSchema.safeParse(
      build({ related_words: [{ relation_type: 'synonym', word_id: ULID('01WORDPADU'), word: { lemma: 'ngamakn' } }] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('related_words.0.word');
    }
  });

  it('word_id dan word tidak diisi sama sekali → VALIDATION_ERROR', () => {
    const result = createWordSchema.safeParse(build({ related_words: [{ relation_type: 'synonym' }] }));
    expect(result.success).toBe(false);
  });

  it('inherit_meanings=true + meanings diisi → VALIDATION_ERROR (berbenturan)', () => {
    const result = createWordSchema.safeParse(
      build({
        related_words: [
          {
            relation_type: 'synonym',
            word: {
              lemma: 'ngamakn',
              inherit_meanings: true,
              meanings: [
                {
                  word_class_id: ULID('01WCNOMINA'),
                  definition: 'x',
                  translations: [{ language_id: ULID('01LANGIDN'), translation_text: 'y' }],
                },
              ],
            },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('related_words.0.word.meanings');
    }
  });

  it('inherit_meanings=false + meaning_overrides diisi → VALIDATION_ERROR', () => {
    const result = createWordSchema.safeParse(
      build({
        related_words: [
          {
            relation_type: 'synonym',
            word: { lemma: 'ngamakn', inherit_meanings: false, meaning_overrides: [{ meaning_index: 0, definition: 'x' }] },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('related_words.0.word.meaning_overrides');
    }
  });

  it('inherit_meanings=false tanpa meanings → VALIDATION_ERROR', () => {
    const result = createWordSchema.safeParse(
      build({ related_words: [{ relation_type: 'synonym', word: { lemma: 'ngamakn', inherit_meanings: false } }] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('related_words.0.word.meanings');
    }
  });

  it('inherit_meanings=false + meanings penuh → valid', () => {
    const result = createWordSchema.safeParse(
      build({
        related_words: [
          {
            relation_type: 'synonym',
            word: {
              lemma: 'badikn',
              inherit_meanings: false,
              meanings: [
                {
                  word_class_id: ULID('01WCNOMINA'),
                  definition: 'Menghabiskan sisa',
                  translations: [{ language_id: ULID('01LANGIDN'), translation_text: 'menghabiskan' }],
                },
              ],
            },
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('lemma inline == lemma induk (case-insensitive) → VALIDATION_ERROR', () => {
    for (const lemma of ['makatn', 'MAKATN']) {
      const result = createWordSchema.safeParse(
        build({ related_words: [{ relation_type: 'synonym', word: { lemma } }] }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.path.join('.'))).toContain('related_words.0.word.lemma');
      }
    }
  });

  it('lemma duplikat antar Form B dalam satu request → VALIDATION_ERROR', () => {
    const result = createWordSchema.safeParse(
      build({
        related_words: [
          { relation_type: 'synonym', word: { lemma: 'ngamakn' } },
          { relation_type: 'antonym', word: { lemma: 'Ngamakn' } },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('guard jumlah: maksimal 5 Form B per request → VALIDATION_ERROR', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ relation_type: 'synonym', word: { lemma: `inline${i}` } }));
    const result = createWordSchema.safeParse(build({ related_words: six }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('related_words');
    }
  });

  it('meaning_index out-of-range (>= jumlah makna induk) → VALIDATION_ERROR field spesifik', () => {
    const result = createWordSchema.safeParse(
      build({
        related_words: [{ relation_type: 'synonym', word: { lemma: 'ngamakn', meaning_overrides: [{ meaning_index: 3, definition: 'x' }] } }],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain(
        'related_words.0.word.meaning_overrides.0.meaning_index',
      );
    }
  });

  it('meaning_index duplikat dalam satu kata inline → VALIDATION_ERROR (deterministik)', () => {
    const result = createWordSchema.safeParse(
      build({
        related_words: [
          {
            relation_type: 'synonym',
            word: {
              lemma: 'ngamakn',
              meaning_overrides: [
                { meaning_index: 0, definition: 'a' },
                { meaning_index: 0, definition: 'b' },
              ],
            },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain(
        'related_words.0.word.meaning_overrides.1.meaning_index',
      );
    }
  });

  it('word_id duplikat antar Form A → VALIDATION_ERROR', () => {
    const result = createWordSchema.safeParse(
      build({ related_words: [{ ...FORM_A }, { relation_type: 'antonym', word_id: ULID('01WORDPADU') }] }),
    );
    expect(result.success).toBe(false);
  });

  it('relasi non-kata (relation_type tidak dikenal) → VALIDATION_ERROR', () => {
    const result = createWordSchema.safeParse(
      build({ related_words: [{ relation_type: 'homonym', word: { lemma: 'ngamakn' } }] }),
    );
    expect(result.success).toBe(false);
  });

  it('has_component pada word_type "word" → VALIDATION_ERROR (aturan silang)', () => {
    const result = createWordSchema.safeParse(
      build({ related_words: [{ relation_type: 'has_component', word: { lemma: 'ngamakn' } }] }),
    );
    expect(result.success).toBe(false);
  });
});

describe('createWordSchema - padanan opsional (is_have_translation)', () => {
  it('definisi nyata + translations kosong + is_have_translation=false → valid', () => {
    const result = createWordSchema.safeParse(
      build({
        meanings: [
          {
            word_class_id: ULID('01WCNOMINA'),
            definition: 'bagian tubuh di bawah ketiak',
            is_have_definition: true,
            is_have_translation: false,
            order_index: 1,
            translations: [],
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meanings[0].is_have_translation).toBe(false);
      expect(result.data.meanings[0].translations).toEqual([]);
    }
  });

  it('definisi nyata + translations kosong (default flag) → valid', () => {
    const result = createWordSchema.safeParse(
      build({
        meanings: [
          {
            word_class_id: ULID('01WCNOMINA'),
            definition: 'uraian makna tanpa padanan tunggal',
            order_index: 1,
            translations: [],
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('is_have_definition=false + translations kosong → ditolak', () => {
    const result = createWordSchema.safeParse(
      build({
        meanings: [
          {
            word_class_id: ULID('01WCNOMINA'),
            definition: '-',
            is_have_definition: false,
            is_have_translation: false,
            order_index: 1,
            translations: [],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe('createWordSchema - is_have_definition placeholder (17)', () => {
  it('is_have_definition=false + sentinel "-" tetap valid (checkbox mobile)', () => {
    const result = createWordSchema.safeParse(
      build({
        meanings: [
          {
            word_class_id: ULID('01WCNOMINA'),
            definition: '-',
            is_have_definition: false,
            order_index: 1,
            translations: [{ language_id: ULID('01LANGIDN'), translation_text: '-', translation_type: 'direct' }],
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meanings[0].is_have_definition).toBe(false);
    }
  });

  it('tanpa is_have_definition → default true (kompatibilitas client lama)', () => {
    const result = createWordSchema.safeParse(build());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meanings[0].is_have_definition).toBe(true);
    }
  });

  it('kelas kata kosong → pesan manusiawi, bukan jargon ULID', () => {
    const result = createWordSchema.safeParse(
      build({
        meanings: [
          {
            word_class_id: '',
            definition: 'Aktivitas memasukkan makanan ke mulut',
            order_index: 1,
            translations: [
              { language_id: ULID('01LANGIDN'), translation_text: 'makan', translation_type: 'direct' },
            ],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'meanings.0.word_class_id');
      expect(issue?.message).toBe('Kelas kata wajib dipilih');
      expect(issue?.message).not.toMatch(/ULID/i);
    }
  });

  it('kelas kata tidak valid → minta pilih ulang dari daftar', () => {
    const result = createWordSchema.safeParse(
      build({
        meanings: [
          {
            word_class_id: 'bukan-ulid',
            definition: 'Aktivitas memasukkan makanan ke mulut',
            order_index: 1,
            translations: [
              { language_id: ULID('01LANGIDN'), translation_text: 'makan', translation_type: 'direct' },
            ],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'meanings.0.word_class_id');
      expect(issue?.message).toBe('Kelas kata tidak valid. Pilih ulang dari daftar.');
    }
  });

  it('definisi tetap wajib min 1 walau placeholder - konvensi client, bukan refine', () => {
    const result = createWordSchema.safeParse(
      build({
        meanings: [
          {
            word_class_id: ULID('01WCNOMINA'),
            definition: '',
            is_have_definition: false,
            order_index: 1,
            translations: [{ language_id: ULID('01LANGIDN'), translation_text: '-', translation_type: 'direct' }],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});
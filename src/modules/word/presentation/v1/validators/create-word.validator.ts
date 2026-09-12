import { z } from 'zod';

const ulid = z.string().length(26, 'ID harus ULID 26 karakter');

export const createWordSchema = z.object({
  language_id: ulid,
  dialect_id: ulid.optional(),
  lemma: z.string().trim().min(1, 'Kata tidak boleh kosong').max(255),
  notes: z.string().optional(),
  meanings: z
    .array(
      z.object({
        word_class_id: ulid,
        definition: z.string().trim().min(1, 'Definisi tidak boleh kosong'),
        order_index: z.coerce.number().int().min(1).default(1),
        translations: z
          .array(
            z.object({
              language_id: ulid,
              translation_text: z.string().trim().min(1, 'Terjemahan tidak boleh kosong'),
              translation_type: z.enum(['direct', 'descriptive', 'idiomatic']).default('direct'),
            }),
          )
          .min(1, 'Minimal harus ada 1 terjemahan'),
        examples: z
          .array(
            z.object({
              source_language_id: ulid,
              source_sentence: z.string().trim().min(1, 'Contoh kalimat tidak boleh kosong'),
              target_language_id: ulid.optional(),
              target_sentence: z.string().optional(),
              source_type: z
                .enum(['native_speaker', 'book', 'corpus', 'interview', 'other'])
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1, 'Minimal harus ada 1 makna'),
  word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']).default('word'),
  category_ids: z
    .array(ulid)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'category_ids tidak boleh ada duplikat',
    }),
  related_words: z
    .array(
      z.object({
        word_id: ulid,
        relation_type: z.enum(['synonym', 'antonym', 'has_component', 'derived_from']),
      }),
    )
    .default([])
    .refine((rels) => new Set(rels.map((r) => r.word_id)).size === rels.length, {
      message: 'related_words tidak boleh ada word_id duplikat',
    }),
  variants: z
    .array(
      z
        .object({
          form: z.string().trim().min(1, 'Bentuk turunan tidak boleh kosong').max(255),
          variant_type: z
            .enum(['inflection', 'derivation', 'alternative', 'reduplication'])
            .default('alternative'),
          affix_type: z.enum(['prefix', 'suffix', 'circumfix', 'reduplication']).optional(),
          affix_value: z.string().trim().max(50).optional(),
          dialect_id: ulid.optional(),
          notes: z.string().max(1000).optional(),
        })
        .refine((v) => !v.affix_type || !!v.affix_value, {
          message: 'affix_value wajib diisi bila affix_type ada',
          path: ['affix_value'],
        }),
    )
    .max(20, 'Maksimal 20 bentuk turunan per kata')
    .optional(),
  pronunciation: z
    .object({
      notation: z.string().trim().min(1).default('ipa'),
      value: z.string().trim().min(1, 'Pengucapan tidak boleh kosong'),
    })
    .optional(),
  images: z
    .array(
      z.object({
        url: z.url('URL gambar tidak valid'),
        provider_file_id: z.string().trim().min(1, 'provider_file_id wajib diisi'),
        alt_text: z.string().trim().max(500).optional(),
        is_primary: z.boolean().default(false),
      }),
    )
    .max(10, 'Maksimal 10 gambar per kata')
    .optional(),
  status: z.enum(['draft', 'published']).default('draft'),
})
  .refine(
    (d) => (d.images ?? []).filter((i) => i.is_primary).length <= 1,
    { message: 'Hanya satu gambar yang boleh is_primary', path: ['images'] },
  )
  .superRefine((d, ctx) => {
    // has_component hanya untuk entri frasa (aturan silang word_type)
    if (
      d.word_type === 'word' &&
      d.related_words.some((r) => r.relation_type === 'has_component')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['related_words'],
        message: 'has_component hanya untuk entri idiom/peribahasa/ungkapan',
      });
    }
  });

export type CreateWordBody = z.infer<typeof createWordSchema>;

const warningSchema = z.object({ field: z.string(), message: z.string() });

export const createWordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    word_id: z.string(),
    lemma: z.string(),
    word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']),
    status: z.enum(['draft', 'pending_review', 'published']),
    created_at: z.string(),
    warnings: z.array(warningSchema).optional(),
  }),
});

export const wordDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    lemma: z.string(),
    language_id: z.string(),
    notes: z.string().nullable(),
    word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']),
    status: z.enum(['draft', 'pending_review', 'published']),
    meanings: z.array(
      z.object({
        word_class_id: z.string().nullable(),
        definition: z.string(),
        order_index: z.number().int(),
        translations: z.array(
          z.object({
            language_id: z.string(),
            translation_text: z.string(),
            translation_type: z.string(),
          }),
        ),
        examples: z.array(
          z.object({
            source_language_id: z.string(),
            source_sentence: z.string(),
            target_language_id: z.string().nullable(),
            target_sentence: z.string().nullable(),
            source_type: z.string().nullable(),
          }),
        ),
      }),
    ),
    categories: z.array(z.object({ id: z.string(), name: z.string() })),
    pronunciations: z.array(
      z.object({
        id: z.string(),
        notation: z.string(),
        value: z.string(),
        dialect_id: z.string().nullable(),
      }),
    ),
    images: z.array(
      z.object({
        url: z.string(),
        alt_text: z.string().nullable(),
        is_primary: z.boolean(),
      }),
    ),
    related_words: z.array(
      z.object({
        word_id: z.string(),
        lemma: z.string(),
        relation_type: z.string(),
      }),
    ),
    appears_in: z.array(
      z.object({
        word_id: z.string(),
        lemma: z.string(),
        relation_type: z.string(),
      }),
    ),
    variants: z.array(
      z.object({
        id: z.string(),
        form: z.string(),
        variant_type: z.string(),
        affix_type: z.string().nullable(),
        affix_value: z.string().nullable(),
        dialect_id: z.string().nullable(),
        notes: z.string().nullable(),
      }),
    ),
  }),
});

export const wordListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      lemma: z.string(),
      language_id: z.string(),
      language_code: z.string(),
      word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']),
      status: z.enum(['draft', 'pending_review', 'published']),
      matched_translation: z.string().optional(), // hanya search_in=translation
    }),
  ),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const wordClassListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      parent_id: z.string().nullable(),
    }),
  ),
});

export const searchWordsQuerySchema = z.object({
  q: z.string().trim().max(255).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
  // lemma = Sambas→Indonesia (default); translation = Indonesia→Sambas
  search_in: z.enum(['lemma', 'translation']).default('lemma'),
  translation_language_id: z.string().length(26).optional(),
  word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']).optional(),
});

export type SearchWordsQueryBody = z.infer<typeof searchWordsQuerySchema>;

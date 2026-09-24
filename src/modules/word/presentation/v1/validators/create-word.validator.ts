import { z } from 'zod';
import { choiceId, opaqueId } from '@/shared/validation/id';
import { queryBooleanSchema } from '@/shared/validation/query-boolean';
import {
  USAGE_LABELS,
  hasConflictingUsageLabels,
} from '@/shared/constants/usage-labels';
import { wordImageInputSchema } from './word-image-input';

export const ulid = opaqueId;
const wordClassId = choiceId('Kelas kata');

// Section 22 - approval gate: pending_review/rejected hanya di-set sistem
export const wordStatusSchema = z.enum([
  'draft',
  'pending_review',
  'published',
  'rejected',
  'taken_down',
]);

export const relationTypeSchema = z.enum(['synonym', 'antonym', 'has_component', 'derived_from']);
export const wordTypeSchema = z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']);
export const usageLabelSchema = z.enum(USAGE_LABELS);

/** Multi-label tertutup; tolak duplikat dan kombinasi halus+kasar. */
export const usageLabelsField = z
  .array(usageLabelSchema)
  .default([])
  .superRefine((labels, ctx) => {
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'usage_labels tidak boleh ada duplikat',
      });
    }
    if (hasConflictingUsageLabels(labels)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Label Halus dan Kasar tidak bisa dipilih bersamaan',
      });
    }
  });

// 11-api-variasi-penulisan.md - item variasi dipakai createWordBodySchema
// DAN inlineWordSchema (Form B sinonim). Aturan item + dedup antar-item
// pusat di sini supaya semua pintu masuk (create/update/anon/correct)
// mewarisinya lewat schema murni.
const wordVariantItemSchema = z
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
  })
  // Ejaan alternatif (variasi penulisan, mis. ketek → ketex/kettek/kete')
  // tidak bermorfolgi - afiks milik inflection/derivation
  .refine((v) => v.variant_type !== 'alternative' || (!v.affix_type && !v.affix_value), {
    message: 'Ejaan alternatif tidak memakai afiks - gunakan tipe inflection/derivation',
    path: ['affix_type'],
  });

const meaningTranslationItemSchema = z.object({
  language_id: ulid,
  translation_text: z.string().trim().min(1, 'Terjemahan tidak boleh kosong'),
  translation_type: z.enum(['direct', 'descriptive', 'idiomatic']).default('direct'),
});

/** Aturan padanan opsional: translations[] boleh kosong jika definisi nyata. */
export function refineMeaningPadanan(
  m: {
    definition: string;
    is_have_definition?: boolean;
    is_have_translation?: boolean;
    translations?: unknown[];
  },
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[],
): void {
  const translations = m.translations ?? [];
  const def = m.definition.trim();
  const hasRealDefinition = m.is_have_definition !== false && def !== '-' && def.length > 0;
  if (translations.length === 0 && !hasRealDefinition) {
    ctx.addIssue({
      code: 'custom',
      path: [...pathPrefix, 'translations'],
      message:
        'Terjemahan kata wajib jika definisi belum diisi. Isi definisi dulu, atau isi terjemahan.',
    });
  }
}

const meaningInputObjectSchema = z.object({
  word_class_id: wordClassId,
  definition: z.string().trim().min(1, 'Definisi tidak boleh kosong'),
  // false = placeholder "-" (belum tahu definisi Indonesia)
  is_have_definition: z.boolean().default(true),
  // false = sengaja tanpa padanan (definisi uraian sudah cukup)
  is_have_translation: z.boolean().default(true),
  order_index: z.coerce.number().int().min(1).default(1),
  translations: z.array(meaningTranslationItemSchema).default([]),
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
});

const wordVariantsField = z
  .array(wordVariantItemSchema)
  .max(20, 'Maksimal 20 bentuk turunan per kata')
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((v, n) => {
      const key = `${v.form.trim().toLowerCase()}|${v.dialect_id ?? ''}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: [n, 'form'],
          message: 'Variasi duplikat (form + dialek sama) dalam satu request',
        });
      }
      seen.add(key);
    });
  })
  .optional();

/**
 * Aturan variasi yang butuh konteks ROOT (perbandingan vs lemma induk).
 * Tidak bisa tinggal di createWordBodySchema karena turunannya memakai
 * `.omit()` (zod: refine memutus .omit) - jadi diekspor dan diterapkan
 * di SETIAP schema turunan (create, update, anon, correct).
 */
export function variantRootRefine(
  d: { lemma: string; variants?: Array<{ form: string }> | undefined },
  ctx: z.RefinementCtx,
): void {
  const variants = d.variants;
  if (!variants?.length) return;
  const parentLemma = d.lemma.trim().toLowerCase();
  variants.forEach((v, n) => {
    if (v.form.trim().toLowerCase() === parentLemma) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants', n, 'form'],
        message: 'Bentuk sama persis dengan lemma - tidak perlu dicatat sebagai variasi',
      });
    }
  });
}

// 04-api-sinonim-inline.md - override satu-per-satu atas makna hasil salinan.
// indeks 0-based mengacu makna INDUK; field yang tidak disebut tetap asli.
const meaningOverrideSchema = z.object({
  meaning_index: z.coerce.number().int().min(0, 'meaning_index harus >= 0'),
  definition: z.string().trim().min(1, 'Definisi tidak boleh kosong').optional(),
  word_class_id: wordClassId.optional(),
  translations: z
    .array(
      z.object({
        language_id: ulid,
        translation_text: z.string().trim().min(1, 'Terjemahan tidak boleh kosong'),
        translation_type: z.enum(['direct', 'descriptive', 'idiomatic']).default('direct'),
      }),
    )
    .optional(),
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
});

// 04-api-sinonim-inline.md - kata baru yang dibuat INLINE (Form B). Per-item
// conflict (inherit vs meanings/overrides) diverifikasi di sini supaya juga
// berlaku lintas konsumen (create, anonim, correct).
const inlineWordSchema = z
  .object({
    lemma: z.string().trim().min(1, 'Kata tidak boleh kosong').max(255),
    notes: z.string().optional(),
    word_type: wordTypeSchema.default('word'),
    usage_labels: usageLabelsField,
    category_ids: z
      .array(ulid)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'category_ids tidak boleh ada duplikat',
      }),
    // DEFAULT true - ikut definisi/makna induk; meanings dilarang saat ini
    inherit_meanings: z.boolean().default(true),
    meaning_overrides: z.array(meaningOverrideSchema).max(20).optional(),
    // wajib DAN hanya saat inherit_meanings=false
    meanings: z.array(meaningInputObjectSchema).min(1, 'Minimal harus ada 1 makna').optional(),
    variants: wordVariantsField,
    pronunciation: z
      .object({
        notation: z.string().trim().min(1).default('ipa'),
        value: z.string().trim().min(1, 'Pengucapan tidak boleh kosong'),
      })
      .optional(),
    images: z.array(wordImageInputSchema).max(10, 'Maksimal 10 gambar per kata').optional(),
    // default: ikut status yang dikirim di body induk
    status: z.enum(['draft', 'published']).optional(),
  })
  .superRefine((w, ctx) => {
    const inherit = w.inherit_meanings;
    if (inherit && w.meanings) {
      ctx.addIssue({
        code: 'custom',
        path: ['meanings'],
        message: 'inherit_meanings=true → meanings dilarang (sinonim ikut makna induk)',
      });
    }
    if (!inherit && w.meaning_overrides) {
      ctx.addIssue({
        code: 'custom',
        path: ['meaning_overrides'],
        message: 'meaning_overrides hanya sah saat inherit_meanings=true',
      });
    }
    if (!inherit && !w.meanings) {
      ctx.addIssue({
        code: 'custom',
        path: ['meanings'],
        message: 'inherit_meanings=false → meanings wajib diisi penuh',
      });
    }
    if ((w.images ?? []).filter((i) => i.is_primary).length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['images'],
        message: 'Hanya satu gambar yang boleh is_primary',
      });
    }
  });

// Object schema murni (tanpa refinement) - dipakai juga modul contribution
// untuk schema correct (`.omit()` tidak bisa dipakai pada schema ber-refine)
export const createWordBodySchema = z.object({
  language_id: ulid,
  dialect_id: ulid.optional(),
  lemma: z.string().trim().min(1, 'Kata tidak boleh kosong').max(255),
  notes: z.string().optional(),
  meanings: z.array(meaningInputObjectSchema).min(1, 'Minimal harus ada 1 makna'),
  word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']).default('word'),
  usage_labels: usageLabelsField,
  category_ids: z
    .array(ulid)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'category_ids tidak boleh ada duplikat',
    }),
  related_words: z
    .array(
      // 04-api-sinonim-inline.md - DUA bentuk per item (Form A link | Form B inline).
      // Kedua field di-optional agar "tepat satu bentuk" bisa diverifikasi secara
      // eksplisit di superRefine (union murni tidak lolos saat keduanya keliru diisi).
      z
        .object({
          relation_type: relationTypeSchema,
          word_id: ulid.optional(),
          word: inlineWordSchema.optional(),
        })
        .superRefine((rel, ctx) => {
          const hasLink = rel.word_id !== undefined;
          const hasInline = rel.word !== undefined;
          if (hasLink && hasInline) {
            ctx.addIssue({
              code: 'custom',
              path: ['word'],
              message: 'word_id (link) dan word (inline) tidak boleh diisi bersamaan - pilih salah satu',
            });
          }
          if (!hasLink && !hasInline) {
            ctx.addIssue({
              code: 'custom',
              path: ['word_id'],
              message: 'Wajib mengisi word_id (link kata lama) ATAU word (kata baru inline)',
            });
          }
        }),
    )
    .default([])
    .superRefine((rels, ctx) => {
      // pat: array sudah membawa path 'related_words' sendiri (zod prepend)
      const arrayPath = [] as never[];
      // duplikat antar Form A (link ke kata existing)
      const linkIds = rels.map((r) => r.word_id).filter((id): id is string => !!id);
      if (new Set(linkIds).size !== linkIds.length) {
        ctx.addIssue({
          code: 'custom',
          path: arrayPath,
          message: 'related_words tidak boleh ada word_id duplikat',
        });
      }
      // duplikat lemma antar Form B (kata inline) + guard maksimal 5
      const inlineLemmas = rels
        .map((r) => r.word?.lemma?.trim().toLowerCase())
        .filter((l): l is string => !!l);
      if (new Set(inlineLemmas).size !== inlineLemmas.length) {
        ctx.addIssue({
          code: 'custom',
          path: arrayPath,
          message: 'Lemma kata inline tidak boleh ada yang duplikat antar Form B',
        });
      }
      const inlineCount = rels.filter((r) => r.word !== undefined).length;
      if (inlineCount > 5) {
        ctx.addIssue({
          code: 'custom',
          path: arrayPath,
          message: 'Maksimal 5 kata baru inline (Form B) per request',
        });
      }
    }),
  variants: wordVariantsField,
  pronunciation: z
    .object({
      notation: z.string().trim().min(1).default('ipa'),
      value: z.string().trim().min(1, 'Pengucapan tidak boleh kosong'),
    })
    .optional(),
  images: z.array(wordImageInputSchema).max(10, 'Maksimal 10 gambar per kata').optional(),
  // Provenance jalur search-miss (12-api) - opsional
  search_miss_id: ulid.optional(),
  status: z.enum(['draft', 'published']).default('draft'),
});

export const createWordSchema = createWordBodySchema
  .refine(
    (d) => (d.images ?? []).filter((i) => i.is_primary).length <= 1,
    { message: 'Hanya satu gambar yang boleh is_primary', path: ['images'] },
  )
  .superRefine((d, ctx) => {
    variantRootRefine(d, ctx); // 11: variasi ≠ lemma induk
    d.meanings.forEach((m, i) => refineMeaningPadanan(m, ctx, ['meanings', i]));
    const parentLemma = d.lemma.trim().toLowerCase();
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

    // 04: aturan lintas induk↔inline (dibutuhkan konteks body induk)
    d.related_words.forEach((rel, n) => {
      if (rel.word === undefined) return;
      const word = rel.word;

      // lemma inline == lemma induk (case-insensitive) → kata tak bisa
      // jadi sinonim dirinya sendiri
      if (word.lemma.trim().toLowerCase() === parentLemma) {
        ctx.addIssue({
          code: 'custom',
          path: ['related_words', n, 'word', 'lemma'],
          message: 'Lemma kata inline tidak boleh sama dengan lemma induk',
        });
      }

      // meaning_index WAJIB valid (0 <= index < jumlah makna induk) +
      // indeks duplikat ditolak (deterministik)
      if (word.meaning_overrides) {
        const seen = new Set<number>();
        word.meaning_overrides.forEach((ov, m) => {
          if (ov.meaning_index >= d.meanings.length) {
            ctx.addIssue({
              code: 'custom',
              path: ['related_words', n, 'word', 'meaning_overrides', m, 'meaning_index'],
              message: `meaning_index melewati jumlah makna induk (${d.meanings.length})`,
            });
          }
          if (seen.has(ov.meaning_index)) {
            ctx.addIssue({
              code: 'custom',
              path: ['related_words', n, 'word', 'meaning_overrides', m, 'meaning_index'],
              message: 'meaning_index duplikat dalam satu kata inline - tentukan satu override per makna',
            });
          }
          seen.add(ov.meaning_index);
        });
      }

      // padanan opsional untuk makna inline penuh
      word.meanings?.forEach((m, mi) => {
        refineMeaningPadanan(m, ctx, ['related_words', n, 'word', 'meanings', mi]);
      });
    });
  });

export type CreateWordBody = z.infer<typeof createWordSchema>;

const warningSchema = z.object({ field: z.string(), message: z.string() });

export const createWordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    word_id: z.string(),
    lemma: z.string(),
    word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']),
    status: wordStatusSchema,
    is_verified: z.boolean(),
    created_at: z.string(),
    search_miss_id: z.string().nullable().optional(),
    warnings: z.array(warningSchema).optional(),
    // 04-api-sinonim-inline.md - hasil tiap kata inline (Form B) yang dibuat,
    // urut sesuai request; hanya muncul saat ada Form B
    inline_created_words: z
      .array(
        z.object({
          word_id: z.string(),
          lemma: z.string(),
          relation_type: relationTypeSchema,
          word_type: wordTypeSchema,
          status: wordStatusSchema,
          is_verified: z.boolean(),
          meanings_count: z.number().int(),
          inherited_meanings_count: z.number().int(),
          overridden_meanings_count: z.number().int(),
          warnings: z.array(warningSchema).optional(),
        }),
      )
      .optional(),
  }),
});

const wordDetailAudioSchema = z.object({
  id: z.string(),
  url: z.string(),
  dialect_id: z.string().nullable(),
  speaker_name: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  is_primary: z.boolean(),
  mime_type: z.string(),
});

export const wordDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    lemma: z.string(),
    language_id: z.string(),
    notes: z.string().nullable(),
    word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']),
    status: wordStatusSchema,
    is_verified: z.boolean(),
    is_corrected: z.boolean(),
    self_verified: z.boolean(),
    created_by: z
      .object({
        username: z.string(),
        role: z.string(),
      })
      .nullable(),
    verified_by: z
      .object({
        username: z.string(),
        role: z.string(),
      })
      .nullable(),
    verified_at: z.string().nullable(),
    meanings: z.array(
      z.object({
        id: z.string(),
        word_class: z
          .object({
            id: z.string(),
            code: z.string(),
            name: z.string(),
            alias: z.string().nullable(),
            description: z.string().nullable(),
            parent_id: z.string().nullable(),
          })
          .nullable(),
        // 04: provenance - terisi = masih "mengikuti" induk, null = mandiri/di-override
        inherited_from_meaning_id: z.string().nullable(),
        definition: z.string(),
        // 17: false = placeholder "-" (belum ada definisi) - client menurunkan
        // CTA "Bantu definisi" dari flag ini, bukan dari teks
        is_have_definition: z.boolean(),
        is_have_translation: z.boolean(),
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
            id: z.string(),
            source_language_id: z.string(),
            source_sentence: z.string(),
            target_language_id: z.string().nullable(),
            target_sentence: z.string().nullable(),
            source_type: z.string().nullable(),
            audios: z.array(wordDetailAudioSchema),
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
        id: z.string(),
        url: z.string(),
        provider_file_id: z.string(),
        sha: z.string().nullable().optional(),
        alt_text: z.string().nullable(),
        is_primary: z.boolean(),
      }),
    ),
    audios: z.array(wordDetailAudioSchema),
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

// 28-api-word-of-the-day.md: detail kata + 2 field tambahan, data nullable
// saat korpus published kosong (200 data:null, bukan error).
export const wordOfDayResponseSchema = wordDetailResponseSchema.extend({
  data: wordDetailResponseSchema.shape.data
    .extend({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      is_new_this_week: z.boolean(),
    })
    .nullable(),
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
      status: wordStatusSchema,
      is_verified: z.boolean(),
      matched_translation: z.string().optional(), // hanya search_in=translation
      matched_variant: z.string().optional(), // 11: form variasi yang cocok (search_in=lemma)
      // A-Z + search: gloss `[n] makan,[v] santap` (null jika belum ada terjemahan)
      sense: z.string().nullable().optional(),
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
      alias: z.string().nullable(),
      description: z.string().nullable(),
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
  is_verified: queryBooleanSchema,
});

/** GET /api/v1/admin/words - panel Kata (tabs tayang / tidak / semua) */
export const adminListWordsQuerySchema = z.object({
  q: z.string().trim().max(255).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
  word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']).optional(),
  is_verified: queryBooleanSchema,
  /** true=tayang, false=tidak tayang, omit=semua */
  published: queryBooleanSchema,
});

/** GET /api/v1/words - daftar semua kata A-Z publik (18-api-list-words.md) */
export const listWordsQuerySchema = z.object({
  q: z.string().trim().max(255).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // OPAQUE base64url komposit (lemma, id) - BEDA dari ULID search; jangan
  // share validator length(26)
  cursor: z.string().optional(),
  word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']).optional(),
});

export type SearchWordsQueryBody = z.infer<typeof searchWordsQuerySchema>;
export type AdminListWordsQueryBody = z.infer<typeof adminListWordsQuerySchema>;
export type ListWordsQueryBody = z.infer<typeof listWordsQuerySchema>;

/** GET /api/v1/words/latest - feed beranda, urut waktu persetujuan. */
export const listLatestWordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Opaque base64url (waktu + id) - bukan ULID 26 karakter.
  cursor: z.string().min(1).optional(),
});

export const latestWordsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      lemma: z.string(),
      language_id: z.string(),
      language_code: z.string(),
      word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']),
      status: wordStatusSchema,
      is_verified: z.boolean(),
      approved_at: z.string(),
      sense: z.string().nullable(),
    }),
  ),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export type ListLatestWordsQueryBody = z.infer<typeof listLatestWordsQuerySchema>;

const duplicateWordItemSchema = z.object({
  id: z.string(),
  lemma: z.string(),
  language_id: z.string(),
  language_code: z.string(),
  word_type: z.enum(['word', 'idiom', 'peribahasa', 'ungkapan']),
  status: wordStatusSchema,
  is_verified: z.boolean(),
  meanings_count: z.number().int(),
  created_at: z.string(),
  suggested_keep: z.boolean(),
});

export const duplicateWordGroupsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    total_groups: z.number().int(),
    groups: z.array(
      z.object({
        lemma: z.string(),
        language_id: z.string(),
        language_code: z.string(),
        default_keep_word_id: z.string(),
        items: z.array(duplicateWordItemSchema),
      }),
    ),
  }),
});

export const mergeDuplicateWordsBodySchema = z.object({
  keep_word_id: opaqueId,
  merge_word_ids: z.array(opaqueId).min(1, 'Pilih minimal satu entri untuk digabung'),
});

export const mergeDuplicateWordsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    keep_word_id: z.string(),
    merged_word_ids: z.array(z.string()),
  }),
});

export type MergeDuplicateWordsBody = z.infer<typeof mergeDuplicateWordsBodySchema>;

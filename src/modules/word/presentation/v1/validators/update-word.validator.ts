import { z } from 'zod';
import {
  createWordBodySchema,
  relationTypeSchema,
  ulid,
  variantRootRefine,
  wordDetailResponseSchema,
  wordStatusSchema,
  wordTypeSchema,
} from './create-word.validator';

// 05-api-edit-kata.md - body PUT = body create dengan related_words Form A
// saja. Di-derive dari createWordBodySchema (bukan disalin) supaya field
// lain tetap satu sumber kebenaran dengan create.
export const updateWordSchema = createWordBodySchema
  .omit({ related_words: true, search_miss_id: true })
  .extend({
    related_words: z
      .array(
        z
          .object({
            relation_type: relationTypeSchema,
            // opsional di level schema agar penolakan Form B membawa pesan
            // yang jelas (kehadiran diverifikasi di superRefine, bukan oleh
            // error tipe zod yang generik)
            word_id: ulid.optional(),
            // penampung kunci Form B - hadir hanya untuk memicu pesan tolak
            // yang jelas (zod default me-strip kunci asing diam-diam)
            word: z.unknown().optional(),
          })
          .superRefine((rel, ctx) => {
            if (rel.word !== undefined) {
              ctx.addIssue({
                code: 'custom',
                path: ['word'],
                message: 'Kreasi kata inline hanya lewat POST /admin/words - buat dulu, lalu link',
              });
            } else if (rel.word_id === undefined) {
              ctx.addIssue({
                code: 'custom',
                path: ['word_id'],
                message: 'Wajib mengisi word_id (link kata lama)',
              });
            }
          }),
      )
      .default([])
      .refine(
        (rels) => new Set(rels.map((r) => r.word_id).filter((id): id is string => !!id)).size ===
          rels.filter((r) => r.word_id !== undefined).length,
        { message: 'related_words tidak boleh ada word_id duplikat' },
      ),
  })
  .refine((d) => (d.images ?? []).filter((i) => i.is_primary).length <= 1, {
    message: 'Hanya satu gambar yang boleh is_primary',
    path: ['images'],
  })
  .refine(
    (d) => !(d.word_type === 'word' && d.related_words.some((r) => r.relation_type === 'has_component')),
    { message: 'has_component hanya untuk entri idiom/peribahasa/ungkapan', path: ['related_words'] },
  )
  .superRefine(variantRootRefine); // 11: variasi ≠ lemma induk

export type UpdateWordBody = z.infer<typeof updateWordSchema>;

const warningSchema = z.object({ field: z.string(), message: z.string() });

export const updateWordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    word_id: z.string(),
    lemma: z.string(),
    word_type: wordTypeSchema,
    status: wordStatusSchema,
    is_verified: z.boolean(),
    is_corrected: z.boolean(),
    updated_at: z.string().nullable(),
    warnings: z.array(warningSchema).optional(),
  }),
});

// Prefill form edit admin - bentuk detail publik + jejak waktu (semua status)
export const adminWordDetailResponseSchema = wordDetailResponseSchema.extend({
  data: wordDetailResponseSchema.shape.data.extend({
    created_at: z.string(),
    updated_at: z.string().nullable(),
    takedown_reason_code: z.string().nullable(),
    takedown_note: z.string().nullable(),
    taken_down_at: z.string().nullable(),
  }),
});

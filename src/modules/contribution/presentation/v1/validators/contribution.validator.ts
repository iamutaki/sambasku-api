import { z } from 'zod';
import {
  createWordBodySchema,
  variantRootRefine,
} from '@/modules/word/presentation/v1/validators/create-word.validator';
import { addPronunciationSchema, addWordImageSchema } from '@/modules/word/presentation/v1/validators/word-media.validator';

export const contributionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'corrected']);
export const entityTypeSchema = z.enum(['word', 'pronunciation', 'word_image', 'example']);

export const listContributionsQuerySchema = z.object({
  status: contributionStatusSchema.optional(),
  entity_type: entityTypeSchema.optional(),
  action: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
});

export type ListContributionsQueryBody = z.infer<typeof listContributionsQuerySchema>;

const commentField = z.string().trim().max(2000).optional();
// true (default) = koreksi langsung tayang (published + verified);
// false = koreksi saja, entity tetap menunggu review (pending_review)
const publishField = z.boolean().default(true);

export const approveContributionSchema = z.object({ comment: commentField });
export const rejectContributionSchema = z.object({
  comment: z.string().trim().min(1, 'Alasan penolakan wajib diisi').max(2000),
});

// Koreksi - discriminated union pada entity_type. Varian 'word' memakai
// schema create-word minus status (replace semantics; pakai base object -
// `.omit()` tidak bisa pada schema ber-refine); varian anak subset field
// yang boleh dikoreksi verifikator.
const correctWordSchema = createWordBodySchema
  .omit({ status: true })
  .extend({
    entity_type: z.literal('word'),
    comment: commentField,
    publish: publishField,
  })
  .refine((d) => (d.images ?? []).filter((i) => i.is_primary).length <= 1, {
    message: 'Hanya satu gambar yang boleh is_primary',
    path: ['images'],
  })
  .superRefine(variantRootRefine); // 11: variasi ≠ lemma induk

export const correctContributionSchema = z.discriminatedUnion('entity_type', [
  correctWordSchema,
  addPronunciationSchema.extend({
    entity_type: z.literal('pronunciation'),
    comment: commentField,
    publish: publishField,
  }),
  addWordImageSchema.extend({
    entity_type: z.literal('word_image'),
    comment: commentField,
    publish: publishField,
  }),
  z.object({
    entity_type: z.literal('example'),
    comment: commentField,
    publish: publishField,
    source_sentence: z.string().trim().min(1, 'Contoh kalimat tidak boleh kosong'),
    target_sentence: z.string().optional(),
    source_type: z.enum(['native_speaker', 'book', 'corpus', 'interview', 'other']).optional(),
    notes: z.string().optional(),
  }),
]);

export type CorrectContributionBody = z.infer<typeof correctContributionSchema>;

const contributionItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  contributor_username: z.string().nullable(),
  entity_type: entityTypeSchema,
  entity_id: z.string(),
  action: z.string(),
  status: contributionStatusSchema,
  created_at: z.string(),
});

export const listContributionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(contributionItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const contributionDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    contribution: contributionItemSchema,
    review: z
      .object({
        reviewer_id: z.string().nullable(),
        status: contributionStatusSchema,
        comment: z.string().nullable(),
        created_at: z.string(),
      })
      .nullable(),
    // payload polymorphic per entity_type - bentuknya didokumentasikan di
    // docs/api/03-api-kontribusi-verifikasi.md (word detail / child + parent)
    entity: z.any(),
  }),
});

export const reviewDecisionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    contribution_id: z.string(),
    entity_type: entityTypeSchema,
    entity_id: z.string(),
    status: z.enum(['pending', 'approved', 'rejected', 'corrected']),
    is_corrected: z.boolean().optional(),
    /** Set saat makna digabung ke lemma published yang sudah ada (12-api §8) */
    merged_into_word_id: z.string().optional(),
  }),
});

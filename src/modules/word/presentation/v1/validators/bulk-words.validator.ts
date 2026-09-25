import { z } from 'zod';
import { WORDS_BULK_MAX } from '../../../application/use-cases/bulk-words-action.use-case';

export const bulkWordsActionSchema = z.enum(['delete', 'publish', 'unpublish']);

export const bulkWordsBodySchema = z.object({
  action: bulkWordsActionSchema,
  ids: z
    .array(z.string().length(26, 'Id kata harus ULID 26 karakter'))
    .min(1, 'Pilih minimal satu kata')
    .max(WORDS_BULK_MAX, `Maksimal ${WORDS_BULK_MAX} kata per permintaan`),
});

export type BulkWordsBody = z.infer<typeof bulkWordsBodySchema>;

const bulkItemSuccessSchema = z.object({
  id: z.string(),
  ok: z.literal(true),
  merged_into_word_id: z.string().nullable(),
});

const bulkItemFailureSchema = z.object({
  id: z.string(),
  ok: z.literal(false),
  error_code: z.string(),
  message: z.string(),
});

export const bulkWordsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    action: bulkWordsActionSchema,
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    results: z.array(z.union([bulkItemSuccessSchema, bulkItemFailureSchema])),
  }),
});

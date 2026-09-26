import { z } from 'zod';
import { opaqueId } from '@/shared/validation/id';
import { queryBooleanSchema } from '@/shared/validation/query-boolean';
import { SEARCH_MISS_BULK_DISMISS_MAX } from '../../../application/use-cases/bulk-dismiss-search-miss.use-case';

export const publicSearchMissQuerySchema = z.object({
  direction: z.enum(['lemma', 'translation']).optional(),
  // beranda top-N - halaman tunggal, tak ada cursor (order hit_count)
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const adminSearchMissQuerySchema = z.object({
  direction: z.enum(['lemma', 'translation']).optional(),
  fulfilled: queryBooleanSchema,
  visible: queryBooleanSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
});

export const updateSearchMissBodySchema = z
  .object({
    term: z.string().min(1).max(255).optional(),
    is_visible: z.boolean().optional(),
  })
  .refine((b) => b.term !== undefined || b.is_visible !== undefined, {
    message: 'Minimal satu field: term atau is_visible',
  });

export const resolveSearchMissBodySchema = z.object({
  action: z.enum(['variant', 'synonym', 'translation']),
  word_id: z.string().length(26),
  meaning_id: z.string().length(26).optional(),
});

export const bulkDismissSearchMissBodySchema = z.object({
  ids: z
    .array(opaqueId)
    .min(1, 'Pilih minimal satu pencarian')
    .max(
      SEARCH_MISS_BULK_DISMISS_MAX,
      `Maksimal ${SEARCH_MISS_BULK_DISMISS_MAX} pencarian per permintaan`,
    ),
});

export type PublicSearchMissQueryBody = z.infer<typeof publicSearchMissQuerySchema>;
export type AdminSearchMissQueryBody = z.infer<typeof adminSearchMissQuerySchema>;
export type UpdateSearchMissBody = z.infer<typeof updateSearchMissBodySchema>;
export type ResolveSearchMissBody = z.infer<typeof resolveSearchMissBodySchema>;
export type BulkDismissSearchMissBody = z.infer<typeof bulkDismissSearchMissBodySchema>;

const searchMissItemSchema = z.object({
  id: z.string(),
  term: z.string(),
  direction: z.enum(['lemma', 'translation']),
  hit_count: z.number().int(),
  last_searched_at: z.string(),
  is_fulfilled: z.boolean(),
  is_visible: z.boolean(),
  created_at: z.string(),
});

export const searchMissListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(searchMissItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const searchMissItemResponseSchema = z.object({
  success: z.literal(true),
  data: searchMissItemSchema,
});

export const resolveSearchMissResponseSchema = z.object({
  success: z.literal(true),
  data: searchMissItemSchema.extend({
    resolved_as: z.enum(['variant', 'synonym', 'translation']),
    target_word_id: z.string(),
    created_word_id: z.string().nullable(),
    variant_id: z.string().nullable(),
  }),
});

const bulkDismissItemSuccessSchema = z.object({
  id: z.string(),
  ok: z.literal(true),
});

const bulkDismissItemFailureSchema = z.object({
  id: z.string(),
  ok: z.literal(false),
  error_code: z.string(),
  message: z.string(),
});

export const bulkDismissSearchMissResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    results: z.array(z.union([bulkDismissItemSuccessSchema, bulkDismissItemFailureSchema])),
  }),
});

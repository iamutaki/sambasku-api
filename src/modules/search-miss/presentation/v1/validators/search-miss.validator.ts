import { z } from 'zod';

export const publicSearchMissQuerySchema = z.object({
  direction: z.enum(['lemma', 'translation']).optional(),
  // beranda top-N - halaman tunggal, tak ada cursor (order hit_count)
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const adminSearchMissQuerySchema = z.object({
  direction: z.enum(['lemma', 'translation']).optional(),
  fulfilled: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
});

export type PublicSearchMissQueryBody = z.infer<typeof publicSearchMissQuerySchema>;
export type AdminSearchMissQueryBody = z.infer<typeof adminSearchMissQuerySchema>;

const searchMissItemSchema = z.object({
  id: z.string(),
  term: z.string(),
  direction: z.enum(['lemma', 'translation']),
  hit_count: z.number().int(),
  last_searched_at: z.string(),
  is_fulfilled: z.boolean(),
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

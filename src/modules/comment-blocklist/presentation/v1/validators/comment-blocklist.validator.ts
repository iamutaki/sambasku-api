import { z } from 'zod';
import { BLOCKLIST_BULK_MAX } from '../../../application/utils/normalize-blocklist-words';

export const createBlocklistWordBodySchema = z.object({
  word: z
    .string()
    .trim()
    .min(1, 'Kata tidak boleh kosong')
    .max(100, 'Kata maksimal 100 karakter'),
});

export type CreateBlocklistWordBody = z.infer<typeof createBlocklistWordBodySchema>;

export const listBlocklistQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().length(26).optional(),
  q: z.string().trim().max(100, 'Pencarian maksimal 100 karakter').optional(),
});

export type ListBlocklistQueryBody = z.infer<typeof listBlocklistQuerySchema>;

const itemSchema = z.object({
  id: z.string(),
  word: z.string(),
  created_by: z.string().nullable(),
  created_at: z.string(),
});

export const listBlocklistResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(itemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const createBlocklistResponseSchema = z.object({
  success: z.literal(true),
  data: itemSchema,
});

export const bulkCreateBlocklistBodySchema = z.object({
  words: z
    .array(z.string().max(1000, 'Satu entri terlalu panjang'))
    .min(1, 'Minimal satu kata')
    .max(BLOCKLIST_BULK_MAX, 'Maksimal 2000 kata per permintaan'),
});

export type BulkCreateBlocklistBody = z.infer<typeof bulkCreateBlocklistBodySchema>;

export const bulkCreateBlocklistResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    created_count: z.number().int(),
    skipped_count: z.number().int(),
    invalid_count: z.number().int(),
  }),
});

import { z } from 'zod';
import { opaqueId } from '@/shared/validation/id';

const importSessionItemSchema = z.object({
  lemma: z.string().trim().min(1).max(255),
  outcome: z.enum(['created', 'meanings_added', 'skipped', 'invalid']),
  meanings_added: z.number().int().min(0),
  message: z.string().trim().max(2000).optional(),
});

export const saveImportSessionBodySchema = z.object({
  id: opaqueId,
  source_label: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['running', 'completed', 'cancelled', 'failed']),
  total: z.number().int().min(0),
  created_count: z.number().int().min(0),
  duplicates_count: z.number().int().min(0),
  meanings_added_count: z.number().int().min(0),
  invalid_count: z.number().int().min(0),
  items: z.array(importSessionItemSchema).max(5000),
});

export const listImportSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: opaqueId.optional(),
});

export const importSessionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    triggered_by: z.string(),
    triggered_by_username: z.string().nullable(),
    attributed_to: z.string(),
    attributed_to_username: z.string().nullable(),
    source_label: z.string().nullable(),
    status: z.enum(['running', 'completed', 'cancelled', 'failed']),
    total: z.number(),
    created_count: z.number(),
    duplicates_count: z.number(),
    meanings_added_count: z.number(),
    invalid_count: z.number(),
    items: z.array(importSessionItemSchema),
    created_at: z.string(),
    finished_at: z.string().nullable(),
  }),
});

export type SaveImportSessionBody = z.infer<typeof saveImportSessionBodySchema>;
export type ListImportSessionsQuery = z.infer<typeof listImportSessionsQuerySchema>;

import { z } from 'zod';
import { KBBI_PROVIDER_IDS } from '../../../application/kbbi-provider-ids';

const LEMMA_PATTERN = /^[\p{L}\p{N}\s'\-.]+$/u;

export const lookupLemmaDefinitionQuerySchema = z.object({
  lemma: z
    .string()
    .trim()
    .min(1, 'Lemma tidak boleh kosong')
    .max(100, 'Lemma maksimal 100 karakter')
    .regex(LEMMA_PATTERN, 'Lemma mengandung karakter yang tidak diizinkan'),
  /** Override provider per-request; default = env KBBI_PROVIDER */
  provider: z.enum(KBBI_PROVIDER_IDS).optional(),
});

const senseSchema = z.object({
  sense_index: z.number().int().positive(),
  word_class_code: z.string().nullable(),
  word_class_label: z.string().nullable(),
  definition: z.string(),
  examples: z.array(z.string()),
  notes: z.string().nullable(),
});

const entrySchema = z.object({
  lemma: z.string(),
  homonym_index: z.number().int().positive(),
  senses: z.array(senseSchema),
});

const suggestionSchema = z.object({
  id: z.string(),
  lemma: z.string(),
  homonym_index: z.number().int().positive(),
  sense_index: z.number().int().positive(),
  word_class_code: z.string().nullable(),
  word_class_label: z.string().nullable(),
  definition: z.string(),
  preview: z.string(),
});

export const lookupLemmaDefinitionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    query: z.string(),
    normalized_query: z.string(),
    found: z.boolean(),
    /** id vendor yang melayani (mis. raf555) */
    provider: z.string(),
    fetched_at: z.string(),
    cache_hit: z.boolean(),
    entries: z.array(entrySchema),
    suggestions: z.array(suggestionSchema),
  }),
});

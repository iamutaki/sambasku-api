import { z } from 'zod';

export const listShareBackgroundsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Query foto tidak boleh kosong')
    .max(120, 'Query foto maksimal 120 karakter'),
});

const backgroundItemSchema = z.object({
  url: z.string(),
  photographer: z.string(),
  username: z.string(),
  unsplash_url: z.string(),
});

export const listShareBackgroundsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    query: z.string(),
    cache_hit: z.boolean(),
    items: z.array(backgroundItemSchema),
  }),
});

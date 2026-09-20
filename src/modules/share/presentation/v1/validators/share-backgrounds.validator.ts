import { z } from 'zod';
import { SHARE_BACKGROUND_PROVIDER_IDS } from '../../../application/ports/share-background-provider.port';

export const listShareBackgroundsQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(120, 'Query foto maksimal 120 karakter')
      .optional()
      .default(''),
    page: z.coerce.number().int().min(1).default(1),
    sort: z.enum(['relevant', 'popular']).default('relevant'),
    provider: z.enum(SHARE_BACKGROUND_PROVIDER_IDS).default('unsplash'),
    limit: z.coerce.number().int().min(1).max(30).default(3),
  })
  .superRefine((val, ctx) => {
    if (val.sort === 'relevant' && !val.q.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Query foto tidak boleh kosong',
        path: ['q'],
      });
    }
  });

const backgroundItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  photographer: z.string(),
  username: z.string(),
  attribution_url: z.string(),
  unsplash_url: z.string(),
  provider: z.enum(SHARE_BACKGROUND_PROVIDER_IDS),
});

export const listShareBackgroundsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    provider: z.enum(SHARE_BACKGROUND_PROVIDER_IDS),
    query: z.string(),
    page: z.number().int().positive(),
    cache_hit: z.boolean(),
    degraded: z.boolean(),
    items: z.array(backgroundItemSchema),
  }),
});

export const listShareBackgroundProvidersResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    providers: z.array(
      z.object({
        id: z.enum(SHARE_BACKGROUND_PROVIDER_IDS),
        label: z.string(),
        available: z.boolean(),
      }),
    ),
  }),
});

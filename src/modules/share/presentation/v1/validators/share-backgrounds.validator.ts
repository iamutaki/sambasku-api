import { z } from 'zod';
import {
  SHARE_BACKGROUND_PROVIDER_IDS,
  SHARE_MEDIA_KINDS,
  SHARE_ORIENTATIONS,
} from '../../../application/ports/share-background-provider.port';

export const listShareBackgroundsQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(120, 'Query latar maksimal 120 karakter')
      .optional()
      .default(''),
    page: z.coerce.number().int().min(1).default(1),
    sort: z.enum(['relevant', 'popular']).default('relevant'),
    provider: z.enum(SHARE_BACKGROUND_PROVIDER_IDS).default('pexels'),
    limit: z.coerce.number().int().min(1).max(30).default(3),
    media: z.enum(SHARE_MEDIA_KINDS).default('photo'),
    orientation: z.enum(SHARE_ORIENTATIONS).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.sort === 'relevant' && !val.q.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Query latar tidak boleh kosong',
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
  kind: z.enum(SHARE_MEDIA_KINDS),
  preview_url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  duration_seconds: z.number().int(),
  mime_type: z.string(),
});

export const listShareBackgroundsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    provider: z.enum(SHARE_BACKGROUND_PROVIDER_IDS),
    query: z.string(),
    page: z.number().int().positive(),
    cache_hit: z.boolean(),
    degraded: z.boolean(),
    media: z.enum(SHARE_MEDIA_KINDS),
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
        media: z.array(z.enum(SHARE_MEDIA_KINDS)),
      }),
    ),
  }),
});

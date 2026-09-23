import { z } from 'zod';

export const uploadPublicImageQuerySchema = z.object({
  purpose: z.enum(['word']).default('word'),
});

export const uploadPublicImageResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    url: z.string().url(),
    provider: z.string(),
    provider_file_id: z.string(),
    sha: z.string(),
  }),
});

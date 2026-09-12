import { z } from 'zod';

export const uploadCredentialsQuerySchema = z.object({
  folder: z.string().trim().max(255).optional(),
});

export const uploadCredentialsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    token: z.string(),
    signature: z.string(),
    expire: z.number().int(),
    public_key: z.string(),
    upload_endpoint: z.string(),
  }),
});

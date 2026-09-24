import { z } from 'zod';

export const googleLinkSchema = z.object({
  id_token: z.string().min(1, 'Token Google wajib diisi'),
});

export type GoogleLinkBody = z.infer<typeof googleLinkSchema>;

export const googleLinkResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    provider: z.literal('google'),
    linked_at: z.string(),
  }),
});

export const authProvidersResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    providers: z.array(
      z.object({
        provider: z.string(),
        linked_at: z.string(),
      }),
    ),
  }),
});

export const unlinkGoogleResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string(),
  }),
});

import { z } from 'zod';

export const publicProfileParamsSchema = z.object({
  username: z.string().trim().min(1).max(100),
});

export const publicProfileResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    username: z.string(),
    role: z.string(),
    is_verifier: z.boolean(),
    joined_at: z.string(),
    stats: z.object({
      contributions_approved: z.number().int(),
      verifications_done: z.number().int(),
    }),
  }),
});

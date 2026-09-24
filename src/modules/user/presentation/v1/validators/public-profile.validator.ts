import { z } from 'zod';

export const publicProfileParamsSchema = z.object({
  username: z.string().trim().min(1).max(100),
});

export const publicProfileResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    username: z.string(),
    display_name: z.string(),
    bio: z.string().nullable(),
    role: z.string(),
    is_verifier: z.boolean(),
    joined_at: z.string(),
    avatar_url: z.string().url().nullable(),
    stats: z.object({
      contributions_approved: z.number().int(),
      verifications_done: z.number().int(),
      comments_published: z.number().int(),
    }),
  }),
});

export const publicActivityResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(
      z.object({
        kind: z.enum(['contribution', 'comment', 'verification']),
        occurred_at: z.string(),
        word_id: z.string().nullable(),
        lemma: z.string().nullable(),
        summary: z.string(),
      }),
    ),
  }),
});

export const avatarUploadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    avatar_url: z.string().url(),
  }),
});

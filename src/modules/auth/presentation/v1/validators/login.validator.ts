import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const loginResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    access_token: z.string(),
    expires_in: z.number().int(),
    user: z.object({
      id: z.string(), // ULID
      username: z.string(),
      role: z.string(),
    }),
  }),
});

export const refreshResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    access_token: z.string(),
    expires_in: z.number().int(),
  }),
});

import { z } from 'zod';

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: z
    .string()
    .min(8)
    .regex(/[a-zA-Z]/, 'harus mengandung huruf')
    .regex(/[0-9]/, 'harus mengandung angka'),
});

export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;

export const resetPasswordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string(),
  }),
});

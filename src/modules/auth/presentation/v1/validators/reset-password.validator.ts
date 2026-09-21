import { z } from 'zod';

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).optional(),
    email: z.email().optional(),
    code: z.string().min(1).optional(),
    new_password: z
      .string()
      .min(8)
      .regex(/[a-zA-Z]/, 'harus mengandung huruf')
      .regex(/[0-9]/, 'harus mengandung angka'),
  })
  .superRefine((value, ctx) => {
    const hasToken = Boolean(value.token?.trim());
    const hasOtp = Boolean(value.email && value.code?.trim());
    if (!hasToken && !hasOtp) {
      ctx.addIssue({
        code: 'custom',
        message: 'Wajib token tautan atau email+kode',
        path: ['token'],
      });
    }
  });

export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;

export const resetPasswordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string(),
  }),
});

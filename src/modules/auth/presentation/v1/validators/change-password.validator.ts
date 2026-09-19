import { z } from 'zod';

export const changePasswordSchema = z
  .object({
    old_password: z.string().min(1, 'Password lama wajib diisi'),
    new_password: z
      .string()
      .min(8)
      .regex(/[a-zA-Z]/, 'harus mengandung huruf')
      .regex(/[0-9]/, 'harus mengandung angka'),
    confirm_password: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Konfirmasi password tidak sama dengan password baru',
  });

export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;

export const changePasswordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string(),
  }),
});

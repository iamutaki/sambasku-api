import { z } from 'zod';

export const updateMyProfileSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, 'Nama tampilan wajib diisi')
      .max(100, 'Nama tampilan maksimal 100 karakter')
      .optional(),
    bio: z
      .string()
      .trim()
      .max(500, 'Bio maksimal 500 karakter')
      .nullable()
      .optional()
      .transform((v) => (v === '' ? null : v)),
  })
  .refine((body) => body.display_name !== undefined || body.bio !== undefined, {
    message: 'Minimal satu field (display_name atau bio) harus diisi',
  });

export type UpdateMyProfileBody = z.infer<typeof updateMyProfileSchema>;

export const myProfileResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    username: z.string(),
    display_name: z.string(),
    bio: z.string().nullable(),
    avatar_url: z.string().url().nullable(),
  }),
});

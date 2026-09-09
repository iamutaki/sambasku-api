import { z } from 'zod';

export const registerSchema = z
  .object({
    username: z.string().min(1).max(100),
    email: z.email(),
    password: z.string().min(8).regex(/[a-zA-Z]/, 'harus mengandung huruf').regex(/[0-9]/, 'harus mengandung angka'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'confirm_password harus sama dengan password',
    path: ['confirm_password'],
  });

export type RegisterBody = z.infer<typeof registerSchema>;

export const registerResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user_id: z.string(), // ULID
    username: z.string(),
    email: z.string(),
  }),
});

import { z } from 'zod';
import { loginResponseSchema } from './login.validator';

export const googleLoginSchema = z.object({
  id_token: z.string().min(1, 'Token Google wajib diisi'),
  client_type: z.enum(['web', 'mobile']).default('web'),
  client_id: z.string().min(1).max(100).optional(),
});

export type GoogleLoginBody = z.infer<typeof googleLoginSchema>;

export { loginResponseSchema as googleLoginResponseSchema };

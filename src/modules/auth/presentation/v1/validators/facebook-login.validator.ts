import { z } from 'zod';
import { loginResponseSchema } from './login.validator';

export const facebookLoginSchema = z.object({
  access_token: z.string().min(1, 'Token Facebook wajib diisi'),
  client_type: z.enum(['web', 'mobile']).default('web'),
});

export type FacebookLoginBody = z.infer<typeof facebookLoginSchema>;

export { loginResponseSchema as facebookLoginResponseSchema };

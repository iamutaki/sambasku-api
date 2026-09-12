import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  // web (default): refresh_token via httpOnly cookie.
  // mobile: refresh_token dikirim di response body — client menyimpannya
  // di secure storage (Keychain/Keystore), lalu mengirimnya di body
  // ke /refresh dan /logout.
  client_type: z.enum(['web', 'mobile']).default('web'),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const loginResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    access_token: z.string(),
    expires_in: z.number().int(),
    refresh_token: z.string().optional(), // hanya ada untuk client_type 'mobile'
    user: z.object({
      id: z.string(), // ULID
      username: z.string(),
      role: z.string(),
    }),
  }),
});

// Body opsional untuk refresh/logout — dipakai klien mobile;
// klien web tetap mengandalkan cookie (body kosong → {})
export const refreshTokenBodySchema = z
  .object({ refresh_token: z.string().min(1).optional() })
  .default({});

export const refreshResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    access_token: z.string(),
    expires_in: z.number().int(),
    refresh_token: z.string().optional(), // hanya untuk klien mobile (via body)
  }),
});

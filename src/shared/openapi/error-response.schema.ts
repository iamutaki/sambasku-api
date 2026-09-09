import { z } from 'zod';

// Bentuk gagal standar (api-base-stack.md Section 13) — dipakai semua modul
// sebagai schema response error di createRoute()
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error_code: z.string(),
  message: z.string(),
  details: z.union([
    z.array(z.object({ field: z.string(), message: z.string() })),
    z.null(),
  ]),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Sukses tanpa payload (logout, dst) — data: null
export const okNullResponseSchema = z.object({
  success: z.literal(true),
  data: z.null(),
});

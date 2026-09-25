import { z } from 'zod';

/**
 * Normalisasi no HP Indonesia ke digit internasional tanpa '+':
 * contoh: 6289988887777
 * Input: digit nasional (812… / 08…), atau sudah 62… / +62….
 * Kosong → null. Prefix negara di-lock 62 dulu (nanti dinamis).
 */
export function normalizeIdPhone(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('62')) digits = digits.slice(2);

  // Mobile ID: mulai 8, total 8-13 digit setelah country code
  if (!/^8\d{7,12}$/.test(digits)) {
    return '__INVALID__';
  }
  return `62${digits}`;
}

export const registerSchema = z
  .object({
    name: z.string().min(1).max(100),
    email: z.email(),
    // Opsional - digit saja; prefix 62 di-lock di client, dinormalisasi di sini
    phone: z.string().max(20).optional(),
    password: z.string().min(8).regex(/[a-zA-Z]/, 'harus mengandung huruf').regex(/[0-9]/, 'harus mengandung angka'),
    confirm_password: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.confirm_password) {
      ctx.addIssue({
        code: 'custom',
        message: 'confirm_password harus sama dengan password',
        path: ['confirm_password'],
      });
    }
    const phone = normalizeIdPhone(d.phone);
    if (phone === '__INVALID__') {
      ctx.addIssue({
        code: 'custom',
        message: 'Nomor HP tidak valid (contoh: 81234567890)',
        path: ['phone'],
      });
    }
  })
  .transform((d) => ({
    name: d.name.trim(),
    email: d.email,
    phone: (() => {
      const p = normalizeIdPhone(d.phone);
      return p === '__INVALID__' ? null : p;
    })(),
    password: d.password,
    confirm_password: d.confirm_password,
  }));

export type RegisterBody = z.infer<typeof registerSchema>;

export const registerResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user_id: z.string(), // ULID
    username: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    verification_required: z.literal(true),
  }),
});

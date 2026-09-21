import { z } from 'zod';
import { normalizeIdPhone } from '@/modules/auth/presentation/v1/validators/register.validator';
import { opaqueId } from '@/shared/validation/id';

export const socialPlatformSchema = z.enum(
  ['instagram', 'facebook', 'tiktok', 'youtube', 'x', 'website'],
  { error: 'Platform tidak valid. Pilih dari daftar.' },
);

export const socialScreenshotSchema = z.object({
  url: z.url('URL screenshot tidak valid'),
  provider_file_id: z.string().trim().min(1, 'provider_file_id wajib diisi'),
});

export const socialLinkSchema = z.object({
  platform: socialPlatformSchema,
  username: z
    .string({ error: 'Nama atau username wajib diisi' })
    .trim()
    .min(1, 'Nama atau username wajib diisi')
    .max(80, 'Nama atau username maksimal 80 karakter')
    .transform((s) => s.replace(/^@+/, '').trim())
    .pipe(
      z
        .string()
        .min(2, 'Nama atau username minimal 2 karakter')
        .max(80, 'Nama atau username maksimal 80 karakter'),
    ),
  screenshot: socialScreenshotSchema,
});

export const submitVerifierApplicationSchema = z
  .object({
    phone: z
      .string({ error: 'Nomor HP wajib diisi' })
      .trim()
      .min(1, 'Nomor HP wajib diisi')
      .max(20, 'Nomor HP terlalu panjang'),
    address: z
      .string({ error: 'Alamat wajib diisi' })
      .trim()
      .min(10, 'Alamat minimal 10 karakter')
      .max(500, 'Alamat maksimal 500 karakter'),
    social_links: z
      .array(socialLinkSchema, { error: 'Minimal satu akun media sosial' })
      .min(1, 'Minimal satu akun media sosial')
      .max(5, 'Maksimal 5 akun media sosial'),
  })
  .superRefine((d, ctx) => {
    if (normalizeIdPhone(d.phone) === '__INVALID__') {
      ctx.addIssue({
        code: 'custom',
        message: 'Nomor HP tidak valid (contoh: 81234567890)',
        path: ['phone'],
      });
    }
  })
  .transform((d) => ({
    phone: normalizeIdPhone(d.phone) as string,
    address: d.address,
    social_links: d.social_links,
  }));

export type SubmitVerifierApplicationBody = z.infer<typeof submitVerifierApplicationSchema>;

export const rejectVerifierApplicationSchema = z.object({
  comment: z.string({ error: 'Alasan penolakan wajib diisi' }).trim().min(1, 'Alasan penolakan wajib diisi').max(2000),
});

export type RejectVerifierApplicationBody = z.infer<typeof rejectVerifierApplicationSchema>;

export const listVerifierApplicationsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: opaqueId.optional(),
});

export type ListVerifierApplicationsQuery = z.infer<typeof listVerifierApplicationsQuerySchema>;

export const verifierApplicationIdParamSchema = z.object({
  id: opaqueId,
});

const socialLinkWire = z.object({
  platform: socialPlatformSchema,
  username: z.string(),
  screenshot: z.object({
    url: z.string(),
    provider_file_id: z.string(),
  }),
});

export const myVerifierApplicationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.enum(['pending', 'approved', 'rejected']),
    phone: z.string(),
    address: z.string(),
    social_links: z.array(socialLinkWire),
    admin_comment: z.string().nullable(),
    reviewed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string().nullable(),
  }),
});

export const adminListVerifierApplicationsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      user_id: z.string(),
      username: z.string().nullable(),
      phone: z.string(),
      status: z.enum(['pending', 'approved', 'rejected']),
      created_at: z.string(),
    }),
  ),
  meta: z.object({
    limit: z.number(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const adminVerifierApplicationDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    user_id: z.string(),
    username: z.string().nullable(),
    status: z.enum(['pending', 'approved', 'rejected']),
    phone: z.string(),
    address: z.string(),
    social_links: z.array(socialLinkWire),
    admin_comment: z.string().nullable(),
    reviewed_by: z.string().nullable(),
    reviewed_by_username: z.string().nullable(),
    reviewed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string().nullable(),
  }),
});

export const approveVerifierApplicationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.literal('approved'),
    role: z.literal('reviewer'),
  }),
});

export const rejectVerifierApplicationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.literal('rejected'),
  }),
});

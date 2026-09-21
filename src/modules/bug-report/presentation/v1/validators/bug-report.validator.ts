import { z } from 'zod';
import { opaqueId } from '@/shared/validation/id';
import { uploadCredentialsResponseSchema } from '@/modules/image/presentation/v1/validators/image.validator';

export const bugReportUploadTokenQuerySchema = z.object({
  folder: z
    .string({ error: 'Folder upload tidak valid' })
    .trim()
    .refine((v) => v === '/bug-reports', { error: 'Folder upload tidak valid' }),
});

export const bugReportImageSchema = z.object({
  url: z.url('Alamat gambar tidak valid'),
  provider_file_id: z
    .string({ error: 'Alamat gambar tidak valid' })
    .trim()
    .min(1, 'Alamat gambar tidak valid'),
});

export const createBugReportBodySchema = z.object({
  description: z
    .string({ error: 'Keterangan wajib diisi minimal 10 karakter' })
    .trim()
    .min(10, 'Keterangan wajib diisi minimal 10 karakter')
    .max(2000, 'Keterangan maksimal 2000 karakter'),
  images: z
    .array(bugReportImageSchema, { error: 'Lampiran tidak boleh lebih dari 4 gambar' })
    .max(4, 'Lampiran tidak boleh lebih dari 4 gambar')
    .optional()
    .default([]),
  app_version: z.string().trim().max(20).optional().nullable(),
  platform: z
    .enum(['android', 'ios'], { error: 'Platform tidak valid' })
    .optional()
    .nullable(),
});

export type CreateBugReportBody = z.infer<typeof createBugReportBodySchema>;

export const createBugReportResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.literal('open'),
    submitted_at: z.string(),
    is_anonymous: z.boolean(),
  }),
});

export { uploadCredentialsResponseSchema };

export const listBugReportsQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: opaqueId.optional(),
});

export type ListBugReportsQuery = z.infer<typeof listBugReportsQuerySchema>;

export const resolveBugReportBodySchema = z.object({
  status: z.enum(['resolved', 'rejected'], { error: 'Status tidak valid' }),
  note: z.string().trim().max(2000).optional().nullable(),
});

export type ResolveBugReportBody = z.infer<typeof resolveBugReportBodySchema>;

export const bugReportIdParamSchema = z.object({
  id: opaqueId,
});

const bugReportImageWireSchema = z.object({
  url: z.string(),
  provider_file_id: z.string(),
});

export const bugReportAdminItemSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  username: z.string().nullable(),
  device_id: z.string().nullable(),
  description: z.string(),
  images: z.array(bugReportImageWireSchema),
  app_version: z.string().nullable(),
  platform: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'rejected']),
  resolution_note: z.string().nullable(),
  resolved_by: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_by: z.string().nullable(),
  updated_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const bugReportListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(bugReportAdminItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const bugReportItemResponseSchema = z.object({
  success: z.literal(true),
  data: bugReportAdminItemSchema,
});

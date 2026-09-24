import { z } from 'zod';
import { opaqueId } from '@/shared/validation/id';
import { uploadCredentialsResponseSchema } from '@/modules/image/presentation/v1/validators/image.validator';

export const translationHelpUploadTokenQuerySchema = z.object({
  folder: z
    .string({ error: 'Folder upload tidak valid' })
    .trim()
    .refine((v) => v === '/translation-helps', { error: 'Folder upload tidak valid' }),
});

export const translationHelpImageSchema = z.object({
  url: z.url('Alamat gambar tidak valid'),
  provider_file_id: z
    .string({ error: 'Alamat gambar tidak valid' })
    .trim()
    .min(1, 'Alamat gambar tidak valid'),
});

export const createTranslationHelpBodySchema = z
  .object({
    body: z
      .string({ error: 'Isi teks minimal 1 karakter' })
      .trim()
      .min(1, 'Isi teks minimal 1 karakter')
      .max(1000, 'Isi teks maksimal 1000 karakter')
      .optional()
      .nullable(),
    images: z
      .array(translationHelpImageSchema, { error: 'Lampiran tidak boleh lebih dari 4 gambar' })
      .max(4, 'Lampiran tidak boleh lebih dari 4 gambar')
      .optional()
      .default([]),
  })
  .superRefine((val, ctx) => {
    const hasBody = val.body != null && val.body.trim().length > 0;
    const hasImages = (val.images?.length ?? 0) > 0;
    if (!hasBody && !hasImages) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'Isi teks atau unggah minimal 1 gambar',
      });
    }
  });

export type CreateTranslationHelpBody = z.infer<typeof createTranslationHelpBodySchema>;

export const createTranslationHelpResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.literal('pending_review'),
    submitted_at: z.string(),
  }),
});

export { uploadCredentialsResponseSchema };

export const translationHelpStatusSchema = z.enum([
  'pending_review',
  'published',
  'rejected',
  'taken_down',
]);

export const listTranslationHelpsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: opaqueId.optional(),
});

export type ListTranslationHelpsQuery = z.infer<typeof listTranslationHelpsQuerySchema>;

export const listMyTranslationHelpsQuerySchema = z.object({
  status: translationHelpStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: opaqueId.optional(),
});

export type ListMyTranslationHelpsQuery = z.infer<typeof listMyTranslationHelpsQuerySchema>;

export const listAdminTranslationHelpsQuerySchema = z.object({
  status: translationHelpStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: opaqueId.optional(),
});

export type ListAdminTranslationHelpsQuery = z.infer<typeof listAdminTranslationHelpsQuerySchema>;

export const translationHelpIdParamSchema = z.object({
  id: opaqueId,
});

export const translationHelpReplyIdParamSchema = z.object({
  id: opaqueId,
});

export const createTranslationHelpReplyBodySchema = z.object({
  body: z
    .string({ error: 'Balasan minimal 1 karakter' })
    .trim()
    .min(1, 'Balasan minimal 1 karakter')
    .max(500, 'Balasan maksimal 500 karakter'),
});

export type CreateTranslationHelpReplyBody = z.infer<typeof createTranslationHelpReplyBodySchema>;

export const rejectTranslationHelpBodySchema = z.object({
  note: z
    .string({ error: 'Alasan penolakan wajib diisi' })
    .trim()
    .min(1, 'Alasan penolakan wajib diisi')
    .max(2000, 'Alasan penolakan maksimal 2000 karakter'),
});

export type RejectTranslationHelpBody = z.infer<typeof rejectTranslationHelpBodySchema>;

export const pinTranslationHelpReplyBodySchema = z.object({
  reply_id: opaqueId,
});

export type PinTranslationHelpReplyBody = z.infer<typeof pinTranslationHelpReplyBodySchema>;

const publicImageWireSchema = z.object({
  public_url: z.string(),
});

const ownerImageWireSchema = z.object({
  url: z.string(),
  provider_file_id: z.string(),
  public_url: z.string().nullable(),
});

const adminImageWireSchema = z.object({
  url: z.string(),
  provider_file_id: z.string(),
  public_url: z.string().nullable(),
});

export const translationHelpReplyPublicSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  username: z.string().nullable(),
  body: z.string().nullable(),
  status: z.enum(['published', 'taken_down', 'deleted_by_author']),
  is_verifier: z.boolean(),
  is_pinned: z.boolean(),
  created_at: z.string(),
});

export const translationHelpPublicItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  username: z.string().nullable(),
  body: z.string().nullable(),
  images: z.array(publicImageWireSchema),
  status: z.literal('published'),
  pinned_reply_id: z.string().nullable(),
  created_at: z.string(),
});

export const translationHelpOwnerItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  username: z.string().nullable(),
  body: z.string().nullable(),
  images: z.array(ownerImageWireSchema),
  status: translationHelpStatusSchema,
  rejection_note: z.string().nullable(),
  pinned_reply_id: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const translationHelpAdminItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  username: z.string().nullable(),
  body: z.string().nullable(),
  images: z.array(adminImageWireSchema),
  status: translationHelpStatusSchema,
  rejection_note: z.string().nullable(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  pinned_reply_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const translationHelpPublicListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(translationHelpPublicItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const translationHelpOwnerListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(translationHelpOwnerItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const translationHelpAdminListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(translationHelpAdminItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const translationHelpPublicDetailResponseSchema = z.object({
  success: z.literal(true),
  data: translationHelpPublicItemSchema.extend({
    replies: z.array(translationHelpReplyPublicSchema),
  }),
});

export const translationHelpOwnerDetailResponseSchema = z.object({
  success: z.literal(true),
  data: translationHelpOwnerItemSchema.extend({
    replies: z.array(translationHelpReplyPublicSchema),
  }),
});

export const translationHelpAdminDetailResponseSchema = z.object({
  success: z.literal(true),
  data: translationHelpAdminItemSchema.extend({
    replies: z.array(
      translationHelpReplyPublicSchema.extend({
        body_original: z.string().nullable(),
        is_censored: z.boolean(),
        reviewed_by: z.string().nullable(),
        reviewed_at: z.string().nullable(),
      }),
    ),
  }),
});

export const translationHelpAdminItemResponseSchema = z.object({
  success: z.literal(true),
  data: translationHelpAdminItemSchema,
});

export const createTranslationHelpReplyResponseSchema = z.object({
  success: z.literal(true),
  data: translationHelpReplyPublicSchema,
});

export const deleteTranslationHelpReplyResponseSchema = z.object({
  success: z.literal(true),
  data: z.null(),
});

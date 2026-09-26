import { z } from 'zod';
import { opaqueId } from '@/shared/validation/id';

export const legalDocumentTypeSchema = z.enum(['terms', 'privacy']);
export const legalDocumentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const consentItemSchema = z.object({
  document_type: legalDocumentTypeSchema,
  document_version: z.string().min(1, 'Versi dokumen wajib').max(64),
});

export const acceptLegalBodySchema = z.object({
  consents: z.array(consentItemSchema).min(2, 'Wajib menyetujui terms dan privacy'),
  client_id: z.string().min(1).max(100).optional(),
  /** social_gate | reconsent | accept_legal - default accept_legal */
  source: z.enum(['social_gate', 'reconsent', 'accept_legal']).optional(),
});

export type AcceptLegalBody = z.infer<typeof acceptLegalBodySchema>;

export const currentLegalResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    terms: z
      .object({
        version: z.string(),
        title: z.string(),
        url: z.string(),
      })
      .nullable(),
    privacy: z
      .object({
        version: z.string(),
        title: z.string(),
        url: z.string(),
      })
      .nullable(),
  }),
});

export const legalDocumentPublicSchema = z.object({
  document_type: legalDocumentTypeSchema,
  version: z.string(),
  title: z.string(),
  body_markdown: z.string(),
  status: legalDocumentStatusSchema,
  published_at: z.string().nullable(),
});

export const legalDocumentPublicResponseSchema = z.object({
  success: z.literal(true),
  data: legalDocumentPublicSchema,
});

export const legalDocumentTypeParamsSchema = z.object({
  type: legalDocumentTypeSchema,
});

export const legalDocumentQuerySchema = z.object({
  version: z.string().min(1).max(64).optional(),
});

export const legalDocumentAdminSchema = z.object({
  id: z.string(),
  document_type: legalDocumentTypeSchema,
  version: z.string(),
  title: z.string(),
  body_markdown: z.string(),
  status: legalDocumentStatusSchema,
  published_at: z.string().nullable(),
  created_by: z.string().nullable(),
  updated_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const legalDocumentAdminResponseSchema = z.object({
  success: z.literal(true),
  data: legalDocumentAdminSchema,
});

export const listAdminLegalQuerySchema = z.object({
  document_type: legalDocumentTypeSchema.optional(),
  status: legalDocumentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const listAdminLegalResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(legalDocumentAdminSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const createLegalDraftBodySchema = z.object({
  document_type: legalDocumentTypeSchema,
  version: z.string().min(1, 'Versi wajib').max(64),
  title: z.string().min(1, 'Judul wajib').max(200),
  body_markdown: z.string().min(1, 'Isi wajib'),
});

export const updateLegalDraftBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    body_markdown: z.string().min(1).optional(),
  })
  .refine((d) => d.title !== undefined || d.body_markdown !== undefined, {
    message: 'Minimal satu field: title atau body_markdown',
  });

export const legalIdParamsSchema = z.object({
  id: opaqueId,
});

export const appSettingItemSchema = z.object({
  key: z.string(),
  value: z.string().nullable(),
  updated_at: z.string().nullable(),
  updated_by: z.string().nullable(),
});

export const appSettingsListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    settings: z.array(appSettingItemSchema),
  }),
});

export const patchAppSettingsBodySchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .min(1, 'Minimal satu pengaturan'),
});

export const acceptLegalResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accepted: z.literal(true),
  }),
});

export type CreateLegalDraftBody = z.infer<typeof createLegalDraftBodySchema>;
export type UpdateLegalDraftBody = z.infer<typeof updateLegalDraftBodySchema>;
export type PatchAppSettingsBody = z.infer<typeof patchAppSettingsBodySchema>;
export type ListAdminLegalQuery = z.infer<typeof listAdminLegalQuerySchema>;

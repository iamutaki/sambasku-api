import { z } from 'zod';
import { opaqueId } from '@/shared/validation/id';

export const deepLinkKindSchema = z.enum([
  'word',
  'contribution',
  'suggestion',
  'url',
  'none',
]);

export const audienceTypeSchema = z.enum(['all', 'selected']);

export const campaignStatusSchema = z.enum([
  'draft',
  'scheduled',
  'sending',
  'completed',
  'failed',
  'cancelled',
]);

const titleSchema = z
  .string({ error: 'Judul wajib diisi' })
  .trim()
  .min(1, 'Judul wajib diisi')
  .max(80, 'Judul maksimal 80 karakter');

const bodySchema = z
  .string({ error: 'Isi wajib diisi' })
  .trim()
  .min(1, 'Isi wajib diisi')
  .max(500, 'Isi maksimal 500 karakter');

export const createTemplateBodySchema = z.object({
  name: z
    .string({ error: 'Nama template wajib diisi' })
    .trim()
    .min(1, 'Nama template wajib diisi')
    .max(100, 'Nama template maksimal 100 karakter'),
  title: titleSchema,
  body: bodySchema,
  deep_link_kind: deepLinkKindSchema.default('none'),
  deep_link_value: z.string().trim().max(500).nullable().optional(),
});

export const updateTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  title: titleSchema.optional(),
  body: bodySchema.optional(),
  deep_link_kind: deepLinkKindSchema.optional(),
  deep_link_value: z.string().trim().max(500).nullable().optional(),
});

export const listTemplatesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: opaqueId.optional(),
});

export const templateIdParamsSchema = z.object({ id: opaqueId });

const templateItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  body: z.string(),
  deep_link_kind: deepLinkKindSchema,
  deep_link_value: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const templateResponseSchema = z.object({
  success: z.literal(true),
  data: templateItemSchema,
});

export const listTemplatesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(templateItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const createCampaignBodySchema = z
  .object({
    template_id: opaqueId.nullable().optional(),
    title: titleSchema.optional(),
    body: bodySchema.optional(),
    deep_link_kind: deepLinkKindSchema.optional(),
    deep_link_value: z.string().trim().max(500).nullable().optional(),
    audience_type: audienceTypeSchema,
    user_ids: z.array(opaqueId).max(500).optional(),
    send_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((v) => v.template_id || (v.title && v.body), {
    message: 'Pilih template atau isi judul dan body',
  });

export const listCampaignsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: opaqueId.optional(),
  status: campaignStatusSchema.optional(),
});

export const campaignIdParamsSchema = z.object({ id: opaqueId });

export const estimateAudienceBodySchema = z.object({
  audience_type: audienceTypeSchema,
  user_ids: z.array(opaqueId).max(500).optional(),
});

const campaignItemSchema = z.object({
  id: z.string(),
  template_id: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  deep_link_kind: deepLinkKindSchema,
  deep_link_value: z.string().nullable(),
  audience_type: audienceTypeSchema,
  status: campaignStatusSchema,
  send_at: z.string().nullable(),
  targeted_users: z.number().int(),
  push_success: z.number().int(),
  push_failed: z.number().int(),
  inbox_written: z.number().int(),
  topic_sent: z.boolean(),
  last_error: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const campaignResponseSchema = z.object({
  success: z.literal(true),
  data: campaignItemSchema,
});

export const listCampaignsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(campaignItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const campaignDetailResponseSchema = z.object({
  success: z.literal(true),
  data: campaignItemSchema.extend({
    recipient_counts: z
      .object({
        pending: z.number().int(),
        sent: z.number().int(),
        failed: z.number().int(),
        skipped_no_token: z.number().int(),
      })
      .nullable(),
    failures: z.array(
      z.object({
        id: z.string(),
        user_id: z.string(),
        status: z.string(),
        error: z.string().nullable(),
      }),
    ),
  }),
});

export const estimateAudienceResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    users_with_device: z.number().int(),
    devices: z.number().int(),
  }),
});

export type CreateTemplateBody = z.infer<typeof createTemplateBodySchema>;
export type UpdateTemplateBody = z.infer<typeof updateTemplateBodySchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
export type CreateCampaignBody = z.infer<typeof createCampaignBodySchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
export type EstimateAudienceBody = z.infer<typeof estimateAudienceBodySchema>;

import { z } from 'zod';
import { opaqueId } from '@/shared/validation/id';

export const inboxNotificationTypeSchema = z.enum([
  'contribution_approved',
  'contribution_rejected',
  'contribution_corrected',
  'suggestion_approved',
  'suggestion_rejected',
  'suggestion_corrected',
  'word_taken_down',
  'contribution_paused',
  'contribution_resumed',
  'translation_help_approved',
  'translation_help_rejected',
  'translation_help_taken_down',
  'campaign',
]);

export const notificationTargetKindSchema = z.enum([
  'contribution',
  'suggestion',
  'word',
  'translation_help',
  'campaign',
]);

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: opaqueId.optional(),
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamsSchema = z.object({
  id: opaqueId,
});

const notificationItemSchema = z.object({
  id: z.string(),
  type: inboxNotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  target_kind: notificationTargetKindSchema,
  target_id: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export const listNotificationsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(notificationItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const unreadCountResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    unread_count: z.number().int(),
  }),
});

export const markReadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    already_read: z.boolean(),
  }),
});

export const markAllReadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    updated: z.number().int(),
  }),
});

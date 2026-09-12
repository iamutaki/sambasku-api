import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
  user_id: z.string().length(26).optional(),
  entity_type: z.string().max(100).optional(),
  entity_id: z.string().length(26).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

const auditLogItemSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  old_data: z.record(z.string(), z.unknown()).nullable(),
  new_data: z.record(z.string(), z.unknown()).nullable(),
  request_id: z.string().nullable(),
  created_at: z.string(),
});

export const auditLogListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(auditLogItemSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

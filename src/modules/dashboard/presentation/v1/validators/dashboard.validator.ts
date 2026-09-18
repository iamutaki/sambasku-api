import { z } from 'zod';

const wordStatusSchema = z.enum(['draft', 'pending_review', 'published', 'rejected']);
const contributionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'corrected']);
const appRoleSchema = z.enum(['root', 'admin', 'editor', 'reviewer', 'contributor']);

export const dashboardStatsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    words: z.object({
      total: z.number().int(),
      verified: z.number().int(),
      deleted: z.number().int(),
      by_status: z.record(wordStatusSchema, z.number().int()),
    }),
    contributions: z.object({
      total: z.number().int(),
      by_status: z.record(contributionStatusSchema, z.number().int()),
    }),
    users: z.object({
      active: z.number().int(),
      by_role: z.record(appRoleSchema, z.number().int()),
    }),
    activity: z.object({
      audit_logs_last_7_days: z.number().int(),
    }),
  }),
});
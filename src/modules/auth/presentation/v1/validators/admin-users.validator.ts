import { z } from 'zod';

export const listAdminUsersQuerySchema = z.object({
  /** Partial match username ATAU email (case-insensitive ILIKE) */
  q: z.string().max(100).optional(),
  /** Filter exact role (exclude root dari filter UI, tapi backend allow untuk list) */
  role: z.enum(['contributor', 'editor', 'reviewer', 'admin', 'root']).optional(),
  can_contribute: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** ULID cursor halaman sebelumnya (created_at,id compound) */
  cursor: z.string().length(26).optional(),
});
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;

export const updateUserRoleBodySchema = z.object({
  role: z.enum(['contributor', 'editor', 'reviewer', 'admin']),
});
export type UpdateUserRoleBody = z.infer<typeof updateUserRoleBodySchema>;

const adminUserWireSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  role: z.enum(['contributor', 'editor', 'reviewer', 'admin', 'root']),
  is_active: z.boolean(),
  can_contribute: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const adminUsersListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(adminUserWireSchema),
  meta: z.object({
    limit: z.number().int(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const updateUserRoleResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    role: z.enum(['contributor', 'editor', 'reviewer', 'admin', 'root']),
  }),
});

import { z } from 'zod';
import { normalizeIdPhone } from './register.validator';

const ASSIGNABLE_ADMIN_ROLES = ['contributor', 'editor', 'reviewer', 'admin'] as const;

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

export const createAdminUserBodySchema = z
  .object({
    username: z.string().trim().min(1).max(100),
    email: z.email(),
    phone: z.string().max(20).optional(),
    password: z.string().min(8).regex(/[a-zA-Z]/, 'harus mengandung huruf').regex(/[0-9]/, 'harus mengandung angka'),
    confirm_password: z.string(),
    role: z.enum(ASSIGNABLE_ADMIN_ROLES),
    is_active: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.confirm_password) {
      ctx.addIssue({
        code: 'custom',
        message: 'confirm_password harus sama dengan password',
        path: ['confirm_password'],
      });
    }
    if (normalizeIdPhone(d.phone) === '__INVALID__') {
      ctx.addIssue({
        code: 'custom',
        message: 'Nomor HP tidak valid (contoh: 81234567890)',
        path: ['phone'],
      });
    }
  })
  .transform((d) => {
    const phone = normalizeIdPhone(d.phone);
    return {
      username: d.username,
      email: d.email,
      phone: phone === '__INVALID__' ? null : phone,
      password: d.password,
      confirm_password: d.confirm_password,
      role: d.role,
      is_active: d.is_active,
    };
  });
export type CreateAdminUserBody = z.infer<typeof createAdminUserBodySchema>;

export const setUserActiveBodySchema = z.object({
  is_active: z.boolean(),
});
export type SetUserActiveBody = z.infer<typeof setUserActiveBodySchema>;

export const adminUserMutationResponseSchema = z.object({
  success: z.literal(true),
  data: adminUserWireSchema,
});

export const setUserActiveResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    is_active: z.boolean(),
  }),
});

export const updateUserRoleResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    role: z.enum(['contributor', 'editor', 'reviewer', 'admin', 'root']),
  }),
});

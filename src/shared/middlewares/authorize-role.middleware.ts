import { createMiddleware } from 'hono/factory';
import type { AppVariables } from '@/shared/types';

// Factory: authorizeRole('admin', 'editor') — dipakai proteksi endpoint
// modul lain (misal POST /api/v1/admin/words dari modul word)
export function authorizeRole(...allowedRoles: string[]) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get('user');
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json(
        {
          success: false as const,
          error_code: 'FORBIDDEN',
          message: 'Role tidak diizinkan mengakses endpoint ini',
          details: null,
        },
        403,
      );
    }
    await next();
  });
}

import { OpenAPIHono } from '@hono/zod-openapi';
import type { z } from 'zod';
import type { AppVariables } from '@/shared/types';

// Factory app OpenAPIHono dengan defaultHook: error validasi Zod otomatis
// dibungkus envelope standar (VALIDATION_ERROR + details per field).
export function createOpenApiApp() {
  return new OpenAPIHono<{ Variables: AppVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            success: false as const,
            error_code: 'VALIDATION_ERROR',
            message: 'Data yang dikirim tidak valid',
            details: (result.error as z.ZodError).issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          400,
        );
      }
    },
  });
}

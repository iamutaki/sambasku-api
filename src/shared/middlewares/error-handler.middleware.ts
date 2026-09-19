import type { ErrorHandler } from 'hono';
import type { z } from 'zod';
import { AppError, BadRequestError, ValidationError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';

// Dipasang sekali di main.ts via app.onError(errorHandler) -
// controller tidak perlu try-catch manual.
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        success: false as const,
        error_code: err.errorCode,
        message: err.message,
        details:
          err instanceof ValidationError
            ? err.details
            : err instanceof BadRequestError
              ? err.details
              : null,
      },
      err.statusCode as 400 | 401 | 403 | 404 | 409,
    );
  }

  // ZodError = gagal parsing schema body/query dari route `c.req.valid()`
  // @hono/zod-openapi throw ZodError langsung (bukan AppError).
  // Ubah jadi VALIDATION_ERROR dengan details[] per field agar bentuk
  // envelope 100% konsisten dengan Section 13 api-base-stack.
  if (err && typeof (err as { name?: string }).name === 'string' && (err as { name: string }).name === 'ZodError') {
    const zerr = err as z.ZodError;
    const details = zerr.issues
      .map((iss) => {
        const field = iss.path.length
          ? iss.path
              .map((p) => (typeof p === 'number' ? `[${p}]` : String(p)))
              .join('.')
              : iss.path[0]
                ? String(iss.path[0])
                : '__root__';
        return { field, message: iss.message };
      })
      .filter((d) => d.field !== '__root__' || d.message !== '');
    return c.json(
      {
        success: false as const,
        error_code: 'VALIDATION_ERROR',
        message: 'Beberapa input tidak valid. Silakan periksa kembali.',
        details,
      },
      400,
    );
  }

  // Error tak terduga - jangan bocorkan detail internal ke client
  logger.error({ err, request_id: c.get('requestId' as never) }, 'Unhandled error');
  return c.json(
    {
      success: false as const,
      error_code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan pada server',
      details: null,
    },
    500,
  );
};

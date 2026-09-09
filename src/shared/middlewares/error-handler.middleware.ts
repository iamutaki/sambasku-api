import type { ErrorHandler } from 'hono';
import { AppError, ValidationError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';

// Dipasang sekali di main.ts via app.onError(errorHandler) —
// controller tidak perlu try-catch manual.
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        success: false as const,
        error_code: err.errorCode,
        message: err.message,
        details: err instanceof ValidationError ? err.details : null,
      },
      err.statusCode as 400 | 401 | 403 | 404 | 409,
    );
  }

  // Error tak terduga — jangan bocorkan detail internal ke client
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

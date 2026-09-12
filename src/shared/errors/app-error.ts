// Hierarki error lintas modul — lihat api-base-stack.md Section 13.
// Use case melempar class ini langsung; mereka tidak tahu soal Hono.
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
}

export class ValidationError extends AppError {
  statusCode = 400;
  errorCode = 'VALIDATION_ERROR';
  constructor(
    public details: { field: string; message: string }[],
  ) {
    super('Data yang dikirim tidak valid');
  }
}

export class NotFoundError extends AppError {
  statusCode = 404;
  errorCode: string;
  constructor(errorCode: string, message: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

export class UnauthorizedError extends AppError {
  statusCode = 401;
  errorCode: string;
  // errorCode bisa dioverride untuk kode spesifik: INVALID_CREDENTIALS, TOKEN_EXPIRED
  constructor(errorCode = 'UNAUTHORIZED', message = 'Tidak terautentikasi') {
    super(message);
    this.errorCode = errorCode;
  }
}

export class ForbiddenError extends AppError {
  statusCode = 403;
  errorCode = 'FORBIDDEN';
}

export class ConflictError extends AppError {
  statusCode = 409;
  errorCode: string;
  // errorCode bisa dioverride untuk kode spesifik: EMAIL_ALREADY_EXISTS, dst
  constructor(errorCode = 'CONFLICT', message = 'Konflik data') {
    super(message);
    this.errorCode = errorCode;
  }
}

export class ServiceUnavailableError extends AppError {
  statusCode = 503;
  errorCode: string;
  constructor(errorCode = 'SERVICE_UNAVAILABLE', message = 'Layanan tidak tersedia') {
    super(message);
    this.errorCode = errorCode;
  }
}

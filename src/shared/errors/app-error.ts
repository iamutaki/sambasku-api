// Hierarki error lintas modul - lihat api-base-stack.md Section 13.
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
  errorCode: string;
  // errorCode bisa dioverride: CANNOT_CHANGE_ROOT, CANNOT_CHANGE_SELF_ROLE, dll
  constructor(errorCode = 'FORBIDDEN', message = 'Tidak diizinkan') {
    super(message);
    this.errorCode = errorCode;
  }
}

export class BadRequestError extends AppError {
  statusCode = 400;
  errorCode: string;
  details: { field: string; message: string }[] | null;
  // errorCode bisa dioverride untuk kode spesifik: INVALID_ROLE,
  // SEARCH_MISS_TERM_MISMATCH, dll
  constructor(
    errorCode = 'BAD_REQUEST',
    message = 'Permintaan tidak valid',
    details: { field: string; message: string }[] | null = null,
  ) {
    super(message);
    this.errorCode = errorCode;
    this.details = details;
  }
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

/** Upstream third-party gagal / timeout / payload tak terparse (502). */
export class BadGatewayError extends AppError {
  statusCode = 502;
  errorCode: string;
  constructor(errorCode = 'BAD_GATEWAY', message = 'Layanan hulu gagal') {
    super(message);
    this.errorCode = errorCode;
  }
}

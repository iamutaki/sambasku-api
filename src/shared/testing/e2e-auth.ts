import { otpCapture } from '@/modules/auth/infrastructure/otp-capture';

/** Kode tampilan terakhir (XXXX-XXXX) dari mailer. Hanya untuk e2e. */
export function capturedOtpDisplayCode(): string {
  const code = otpCapture.lastDisplayCode;
  if (!code) throw new Error('OTP tidak tertangkap dari mailer');
  return code;
}

/** Versi legal seed migrasi 0020 / reseedTestReferenceData. */
export const E2E_LEGAL_VERSION = '2026-09-26';

export const E2E_LEGAL_CONSENTS = [
  { document_type: 'terms' as const, document_version: E2E_LEGAL_VERSION },
  { document_type: 'privacy' as const, document_version: E2E_LEGAL_VERSION },
];

/**
 * Body POST /auth/register untuk e2e: selalu sertakan consents + client_id
 * first-party (wajib sejak legal consent).
 */
export function e2eRegisterBody(input: {
  name: string;
  email: string;
  password?: string;
  client_id?: string;
  phone?: string;
}): {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
  client_id: string;
  consents: typeof E2E_LEGAL_CONSENTS;
  phone?: string;
} {
  const password = input.password ?? 'Password123';
  return {
    name: input.name,
    email: input.email,
    password,
    confirm_password: password,
    client_id: input.client_id ?? 'sambasku-web',
    consents: E2E_LEGAL_CONSENTS,
    ...(input.phone ? { phone: input.phone } : {}),
  };
}

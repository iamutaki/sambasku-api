import { hashToken } from './token';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

export function generateOtpDigits(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 1_000_000).toString().padStart(6, '0');
}

export function formatOtpDisplay(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function normalizeOtpCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 6) return null;
  return digits;
}

export function hashOtp(userId: string, digits: string): string {
  return hashToken(`${userId}:${digits}`);
}

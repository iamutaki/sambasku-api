import { hashToken } from './token';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
export const OTP_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const OTP_CODE_LENGTH = 8;

/** 8 karakter 0-9A-Z, tanpa bias modulo. */
export function generateOtpCode(): string {
  const n = OTP_ALPHABET.length;
  const limit = Math.floor(256 / n) * n;
  let result = '';
  while (result.length < OTP_CODE_LENGTH) {
    const buf = new Uint8Array(OTP_CODE_LENGTH - result.length);
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= limit) continue;
      result += OTP_ALPHABET[byte % n];
      if (result.length === OTP_CODE_LENGTH) break;
    }
  }
  return result;
}

export function formatOtpDisplay(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeOtpCode(raw: string): string | null {
  const code = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (code.length !== OTP_CODE_LENGTH) return null;
  return code;
}

export function hashOtp(userId: string, code: string): string {
  return hashToken(`${userId}:${code}`);
}

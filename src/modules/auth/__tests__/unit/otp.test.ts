import { describe, it, expect } from 'vitest';
import { formatOtpDisplay, hashOtp, normalizeOtpCode } from '../../application/utils/otp';
import { hashToken } from '../../application/utils/token';

describe('otp utils', () => {
  it('format tampilan XXX-XYZ', () => {
    expect(formatOtpDisplay('482917')).toBe('482-917');
  });

  it('menerima 123456 atau 123-456', () => {
    expect(normalizeOtpCode('123456')).toBe('123456');
    expect(normalizeOtpCode('123-456')).toBe('123456');
    expect(normalizeOtpCode('12-34')).toBeNull();
  });

  it('hash SHA-256 userId:digits', () => {
    expect(hashOtp('user-1', '482917')).toBe(hashToken('user-1:482917'));
  });
});

import { describe, it, expect } from 'vitest';
import { otpEmailHtml, otpEmailText } from '../../infrastructure/otp-email';
import {
  OTP_EMAIL_LOGO_CONTENT_ID,
  OTP_EMAIL_LOGO_FILENAME,
  OTP_EMAIL_LOGO_MIME,
} from '../../infrastructure/otp-email-logo';

describe('otp email template', () => {
  it('teks memuat kode XXXX-XXXX', () => {
    expect(otpEmailText('A4K9-M2XP')).toContain('A4K9-M2XP');
  });

  it('html memuat kode dan logo CID horizontal PNG', () => {
    const html = otpEmailHtml('A4K9-M2XP');
    expect(html).toContain('A4K9-M2XP');
    expect(html).toContain('8 karakter 0-9A-Z');
    expect(html).toContain('XXXX-XXXX');
    expect(html).toContain(`cid:${OTP_EMAIL_LOGO_CONTENT_ID}`);
    expect(html).toContain('width="220"');
    expect(html).toContain('alt="SambasKu"');
    expect(html).not.toContain('height="96"');
    expect(html).not.toContain('<script');
  });

  it('lampiran logo email PNG (bukan WebP/JPEG)', () => {
    expect(OTP_EMAIL_LOGO_MIME).toBe('image/png');
    expect(OTP_EMAIL_LOGO_FILENAME).toBe('sambasku-logo-email.png');
  });

  it('escape HTML di kode', () => {
    expect(otpEmailHtml('<b>x</b>')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

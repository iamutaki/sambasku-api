import { describe, expect, it } from 'vitest';
import {
  resetPasswordEmailHtml,
  resetPasswordEmailText,
} from '../../infrastructure/reset-password-email';
import { OTP_EMAIL_LOGO_CONTENT_ID } from '../../infrastructure/otp-email-logo';

describe('reset-password-email', () => {
  it('teks memuat kode XXXX-XXXX dan tautan cadangan', () => {
    const text = resetPasswordEmailText(
      'https://app.test/reset-password?token=tok1',
      'A4K9-M2XP',
    );
    expect(text).toContain('A4K9-M2XP');
    expect(text).toContain('https://app.test/reset-password?token=tok1');
    expect(text).toContain('10 menit');
  });

  it('html memuat kode, tombol tautan, logo CID, tanpa script', () => {
    const url = 'https://app.test/reset-password?token=tok1';
    const html = resetPasswordEmailHtml(url, 'A4K9-M2XP');
    expect(html).toContain('A4K9-M2XP');
    expect(html).toContain('8 karakter 0-9A-Z');
    expect(html).toContain('XXXX-XXXX');
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('Atur password baru');
    expect(html).toContain(`cid:${OTP_EMAIL_LOGO_CONTENT_ID}`);
    expect(html).toContain('width="220"');
    expect(html).not.toContain('<script');
  });

  it('html meng-escape karakter berbahaya di URL', () => {
    const html = resetPasswordEmailHtml(
      'https://app.test/reset-password?token="><script>',
      'A4K9-M2XP',
    );
    expect(html).toContain('&quot;');
    expect(html).not.toContain('href="https://app.test/reset-password?token="><script>"');
  });
});

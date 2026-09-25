import { describe, expect, it } from 'vitest';
import {
  resetPasswordEmailHtml,
  resetPasswordEmailText,
} from '../../infrastructure/reset-password-email';
import { OTP_EMAIL_LOGO_CONTENT_ID } from '../../infrastructure/otp-email-logo';

describe('reset-password-email', () => {
  it('teks memuat kode XXXX-XXXX tanpa tautan', () => {
    const text = resetPasswordEmailText('A4K9-M2XP');
    expect(text).toContain('A4K9-M2XP');
    expect(text).toContain('10 menit');
    expect(text).toContain('aplikasi');
    expect(text).not.toContain('http');
  });

  it('html memuat kode dan logo CID, tanpa tombol tautan', () => {
    const html = resetPasswordEmailHtml('A4K9-M2XP');
    expect(html).toContain('A4K9-M2XP');
    expect(html).toContain('8 karakter 0-9A-Z');
    expect(html).toContain('XXXX-XXXX');
    expect(html).toContain(`cid:${OTP_EMAIL_LOGO_CONTENT_ID}`);
    expect(html).toContain('width="300"');
    expect(html).not.toContain('Atur password baru');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('<script');
  });

  it('html meng-escape karakter berbahaya di kode', () => {
    expect(resetPasswordEmailHtml('<b>x</b>')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

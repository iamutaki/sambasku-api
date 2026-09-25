import { describe, expect, it } from 'vitest';
import { accountDeletionEmailHtml } from '../../infrastructure/account-deletion-email';
import { otpEmailHtml } from '../../infrastructure/otp-email';
import { resetPasswordEmailHtml } from '../../infrastructure/reset-password-email';
import { verifierApprovedEmailHtml } from '../../infrastructure/verifier-approved-email';

const CODE = 'AB12-CD34';

describe('branded email templates', () => {
  it('hapus akun memakai kartu yang sama dengan verifikasi dan reset password', () => {
    const deletion = accountDeletionEmailHtml(CODE, 'https://sambasku.test/hapus-akun');
    const otp = otpEmailHtml(CODE);
    const reset = resetPasswordEmailHtml(CODE);

    for (const html of [deletion, otp, reset]) {
      expect(html).toContain('cid:sambasku-logo');
      expect(html).toContain('#C5A35A');
      expect(html).toContain('#F6F1E8');
      expect(html).toContain(CODE);
    }
    expect(deletion).toContain('Hapus akun');
    expect(deletion).toContain('https://sambasku.test/hapus-akun');
    expect(deletion).toContain('konfirmasi HAPUS');
  });

  it('mengabaikan tautan yang bukan http(s)', () => {
    const html = accountDeletionEmailHtml(CODE, 'javascript:alert(1)');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Buka halaman hapus akun');
  });

  it('ucapan verifikator memakai kartu yang sama dan meng-escape nama', () => {
    const html = verifierApprovedEmailHtml('Budi <script>');
    expect(html).toContain('cid:sambasku-logo');
    expect(html).toContain('#C5A35A');
    expect(html).toContain('Verifikator');
    expect(html).toContain('Selamat, Budi &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

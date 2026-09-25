import { brandedCodeEmailHtml } from './branded-email';

export function resetPasswordEmailText(displayCode: string): string {
  return (
    `Kode reset password SambasKu (berlaku 10 menit): ${displayCode}\n\n` +
    'Masukkan kode ini di aplikasi. Abaikan email ini jika Anda tidak meminta reset password.'
  );
}

export function resetPasswordEmailHtml(displayCode: string): string {
  return brandedCodeEmailHtml({
    title: 'Reset password SambasKu',
    eyebrow: 'Reset password',
    intro: 'Masukkan 8 karakter 0-9A-Z di aplikasi',
    code: displayCode,
    note: 'Berlaku 10 menit. Format tampilan XXXX-XXXX.',
    footer: 'Abaikan email ini jika Anda tidak meminta reset password di SambasKu.',
  });
}

import { brandedCodeEmailHtml } from './branded-email';

const DETAIL =
  'Masukkan kode ini bersama konfirmasi HAPUS. Akun, email, dan data pribadi akan dihapus. Entri kamus yang sudah tayang tetap ada tanpa namamu.';

export function accountDeletionEmailText(displayCode: string, pageUrl: string): string {
  return (
    `Kode hapus akun SambasKu (berlaku 10 menit): ${displayCode}\n\n` +
    `${DETAIL}\n\n` +
    `Halaman: ${pageUrl}\n\n` +
    'Abaikan email ini jika Anda tidak meminta penghapusan akun di SambasKu.'
  );
}

export function accountDeletionEmailHtml(displayCode: string, pageUrl: string): string {
  return brandedCodeEmailHtml({
    title: 'Kode hapus akun SambasKu',
    eyebrow: 'Hapus akun',
    intro: 'Masukkan 8 karakter 0-9A-Z di halaman hapus akun',
    code: displayCode,
    note: 'Berlaku 10 menit. Format tampilan XXXX-XXXX.',
    detail: DETAIL,
    action: { href: pageUrl, label: 'Buka halaman hapus akun' },
    footer: 'Abaikan email ini jika Anda tidak meminta penghapusan akun di SambasKu.',
  });
}

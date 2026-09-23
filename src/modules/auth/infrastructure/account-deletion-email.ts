export function accountDeletionEmailText(displayCode: string, pageUrl: string): string {
  return (
    `Kode hapus akun SambasKu (berlaku 10 menit): ${displayCode}\n\n` +
    `Masukkan kode ini di ${pageUrl} bersama konfirmasi HAPUS. ` +
    'Akun, email, dan data pribadi akan dihapus. Entri kamus yang sudah tayang tetap ada tanpa nama kamu.\n\n' +
    'Abaikan email ini jika kamu tidak meminta penghapusan akun.'
  );
}

export function accountDeletionEmailHtml(displayCode: string): string {
  const code = displayCode
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return `<p>Kode hapus akun SambasKu (berlaku 10 menit): <strong>${code}</strong></p>
<p>Masukkan kode ini di halaman hapus akun bersama konfirmasi HAPUS. Akun dan data pribadi akan dihapus. Entri kamus yang sudah tayang tetap ada tanpa namamu.</p>
<p>Abaikan email ini jika kamu tidak meminta penghapusan akun.</p>`;
}

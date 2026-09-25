import { brandedMessageEmailHtml } from './branded-email';

export function verifierApprovedEmailText(displayName: string): string {
  return (
    `Selamat, ${displayName}.\n\n` +
    'Pengajuan Anda disetujui. Anda sekarang Verifikator SambasKu.\n\n' +
    'Terima kasih sudah bersedia menjaga ketepatan kamus bahasa Sambas bersama kami. Ini apresiasi dari tim SambasKu.\n\n' +
    'Masuk ulang agar peran baru aktif, lalu mulai meninjau kontribusi.'
  );
}

export function verifierApprovedEmailHtml(displayName: string): string {
  return brandedMessageEmailHtml({
    title: 'Selamat menjadi Verifikator SambasKu',
    eyebrow: 'Verifikator',
    heading: `Selamat, ${displayName}`,
    paragraphs: [
      'Pengajuan Anda disetujui. Anda sekarang Verifikator SambasKu.',
      'Terima kasih sudah bersedia menjaga ketepatan kamus bahasa Sambas bersama kami. Ini apresiasi dari tim SambasKu.',
      'Masuk ulang agar peran baru aktif, lalu mulai meninjau kontribusi.',
    ],
    footer: 'Tim SambasKu',
  });
}

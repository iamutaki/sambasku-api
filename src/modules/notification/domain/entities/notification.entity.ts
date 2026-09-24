export type InboxNotificationType =
  | 'contribution_approved'
  | 'contribution_rejected'
  | 'contribution_corrected'
  | 'suggestion_approved'
  | 'suggestion_rejected'
  | 'suggestion_corrected'
  | 'word_taken_down'
  | 'contribution_paused'
  | 'contribution_resumed'
  | 'translation_help_approved'
  | 'translation_help_rejected'
  | 'translation_help_taken_down'
  | 'campaign';

export type NotificationTargetKind =
  | 'contribution'
  | 'suggestion'
  | 'word'
  | 'translation_help'
  | 'campaign';

export interface InboxNotification {
  id: string;
  userId: string;
  type: InboxNotificationType;
  title: string;
  body: string;
  targetKind: NotificationTargetKind;
  targetId: string;
  readAt: Date | null;
  createdAt: Date;
}

export function inboxCopyFor(type: InboxNotificationType): { title: string; body: string } {
  switch (type) {
    case 'contribution_approved':
      return {
        title: 'Kata sudah dicek',
        body: 'Tim sudah memeriksa usulanmu. Labelnya sekarang Terverifikasi.',
      };
    case 'contribution_rejected':
      return {
        title: 'Kata ditarik',
        body: 'Usulanmu ditarik dari kamus. Buka Kontribusi Saya untuk melihat alasan.',
      };
    case 'contribution_corrected':
      return {
        title: 'Usulan dikoreksi',
        body: 'Tim mengoreksi usulanmu. Entri tetap tayang dan sudah dicek.',
      };
    case 'suggestion_approved':
      return {
        title: 'Usulan perubahan selesai',
        body: 'Usulan perubahanmu selesai diperiksa.',
      };
    case 'suggestion_rejected':
      return {
        title: 'Usulan perubahan ditolak',
        body: 'Usulan perubahan ditolak. Buka Kontribusi Saya untuk melihat hasilnya.',
      };
    case 'suggestion_corrected':
      return {
        title: 'Usulan perubahan dikoreksi',
        body: 'Tim mengoreksi usulan perubahanmu dan menerapkannya.',
      };
    case 'word_taken_down':
      return {
        title: 'Entri ditarik',
        body: 'Entri yang kamu buat ditarik dari kamus.',
      };
    case 'contribution_paused':
      return {
        title: 'Kontribusi dihentikan',
        body: 'Kamu belum bisa mengirim usulan baru. Usulan yang sudah tayang tetap ada.',
      };
    case 'contribution_resumed':
      return {
        title: 'Kontribusi dibuka lagi',
        body: 'Kamu bisa mengirim usulan lagi.',
      };
    case 'translation_help_approved':
      return {
        title: 'Bantuan terjemahan tayang',
        body: 'Permintaan bantuanmu sudah diperiksa dan tayang di feed.',
      };
    case 'translation_help_rejected':
      return {
        title: 'Bantuan terjemahan ditolak',
        body: 'Permintaan bantuanmu ditolak. Buka riwayat untuk melihat alasan.',
      };
    case 'translation_help_taken_down':
      return {
        title: 'Bantuan terjemahan ditarik',
        body: 'Permintaan bantuanmu ditarik dari feed.',
      };
    case 'campaign':
      // Title/body campaign selalu dari snapshot admin (bukan copy bawaan).
      return { title: 'Pengumuman', body: '' };
  }
}

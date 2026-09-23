export type InboxNotificationType =
  | 'contribution_approved'
  | 'contribution_rejected'
  | 'contribution_corrected'
  | 'suggestion_approved'
  | 'suggestion_rejected'
  | 'suggestion_corrected'
  | 'word_taken_down'
  | 'contribution_paused'
  | 'contribution_resumed';

export type NotificationTargetKind = 'contribution' | 'suggestion' | 'word';

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
  }
}

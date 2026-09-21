export type InboxNotificationType =
  | 'contribution_approved'
  | 'contribution_rejected'
  | 'contribution_corrected'
  | 'suggestion_approved'
  | 'suggestion_rejected'
  | 'suggestion_corrected';

export type NotificationTargetKind = 'contribution' | 'suggestion';

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
        title: 'Usulan disetujui',
        body: 'Usulan kata Anda telah disetujui dan dipublikasikan.',
      };
    case 'contribution_rejected':
      return {
        title: 'Usulan ditolak',
        body: 'Usulan kata Anda ditolak. Buka Kontribusi Saya untuk melihat alasan.',
      };
    case 'contribution_corrected':
      return {
        title: 'Usulan dikoreksi',
        body: 'Usulan kata Anda dikoreksi dan dipublikasikan oleh verifikator.',
      };
    case 'suggestion_approved':
      return {
        title: 'Usulan perubahan disetujui',
        body: 'Usulan perubahan kata Anda telah diterapkan.',
      };
    case 'suggestion_rejected':
      return {
        title: 'Usulan perubahan ditolak',
        body: 'Usulan perubahan kata Anda ditolak. Buka Kontribusi Saya untuk melihat alasan.',
      };
    case 'suggestion_corrected':
      return {
        title: 'Usulan perubahan dikoreksi',
        body: 'Usulan perubahan kata Anda dikoreksi dan diterapkan.',
      };
  }
}

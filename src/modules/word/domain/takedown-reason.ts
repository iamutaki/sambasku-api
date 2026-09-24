import { ValidationError } from '@/shared/errors/app-error';
import {
  TAKEDOWN_REASON_CODES,
  WORD_REPORT_REASON_CODES,
  type TakedownReasonCode,
  type WordReportReasonCode,
} from './entities/word.entity';

export function isTakedownReasonCode(value: string): value is TakedownReasonCode {
  return (TAKEDOWN_REASON_CODES as readonly string[]).includes(value);
}

export function isWordReportReasonCode(value: string): value is WordReportReasonCode {
  return (WORD_REPORT_REASON_CODES as readonly string[]).includes(value);
}

/** Catatan wajib untuk `other` dan `duplicate`. Kosong selain itu jadi null. */
export function normalizeTakedownNote(
  reason: WordReportReasonCode,
  note: string | null | undefined,
): string | null {
  const trimmed = note?.trim() ?? '';
  if ((reason === 'other' || reason === 'duplicate') && trimmed.length === 0) {
    throw new ValidationError([{ field: 'note', message: 'Catatan wajib diisi untuk alasan ini' }]);
  }
  if (trimmed.length > 1000) {
    throw new ValidationError([{ field: 'note', message: 'Catatan maksimal 1000 karakter' }]);
  }
  return trimmed.length > 0 ? trimmed : null;
}

import { BadRequestError, ForbiddenError } from '@/shared/errors/app-error';
import type { LegalActiveVersions } from '../../domain/entities/app-setting.entity';
import type { ConsentDocumentType } from '../../domain/entities/user-consent.entity';

export interface ConsentInput {
  documentType: ConsentDocumentType;
  documentVersion: string;
}

/**
 * Validasi consents[] terhadap versi aktif di app_settings.
 * CONSENT_REQUIRED: kurang/invalid struktur.
 * LEGAL_CONSENT_OUTDATED: versi tidak cocok dengan aktif.
 */
export function assertConsentsMatchActiveVersions(
  consents: ConsentInput[] | null | undefined,
  active: LegalActiveVersions | null,
): asserts consents is ConsentInput[] {
  if (!active?.termsVersion || !active?.privacyVersion) {
    throw new BadRequestError(
      'CONSENT_REQUIRED',
      'Dokumen legal belum dikonfigurasi. Coba lagi nanti.',
    );
  }

  if (!consents || !Array.isArray(consents) || consents.length === 0) {
    throw new BadRequestError(
      'CONSENT_REQUIRED',
      'Persetujuan Syarat Ketentuan dan Kebijakan Privasi wajib',
      [{ field: 'consents', message: 'Centang dan kirim persetujuan terms serta privacy' }],
    );
  }

  const byType = new Map<string, string>();
  for (const c of consents) {
    if (!c?.documentType || !c?.documentVersion?.trim()) {
      throw new BadRequestError(
        'CONSENT_REQUIRED',
        'Setiap consent wajib punya document_type dan document_version',
        [{ field: 'consents', message: 'Format consent tidak lengkap' }],
      );
    }
    if (c.documentType !== 'terms' && c.documentType !== 'privacy') {
      throw new BadRequestError(
        'CONSENT_REQUIRED',
        'document_type harus terms atau privacy',
        [{ field: 'consents', message: 'Tipe dokumen tidak dikenali' }],
      );
    }
    byType.set(c.documentType, c.documentVersion.trim());
  }

  if (!byType.has('terms') || !byType.has('privacy')) {
    throw new BadRequestError(
      'CONSENT_REQUIRED',
      'Wajib menyetujui Syarat Ketentuan dan Kebijakan Privasi',
      [{ field: 'consents', message: 'Harus mencakup terms dan privacy' }],
    );
  }

  const termsOk = byType.get('terms') === active.termsVersion;
  const privacyOk = byType.get('privacy') === active.privacyVersion;
  if (!termsOk || !privacyOk) {
    throw new ForbiddenError(
      'LEGAL_CONSENT_OUTDATED',
      'Versi dokumen legal sudah berubah. Muat ulang dan setujui versi terbaru.',
      [
        {
          field: 'consents',
          message: `Versi aktif: terms ${active.termsVersion}, privacy ${active.privacyVersion}`,
        },
      ],
    );
  }
}

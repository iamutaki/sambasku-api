import { NotFoundError } from '@/shared/errors/app-error';
import { env } from '@/shared/config/env';
import type { AppSettingsRepository } from '../../domain/repositories/app-settings.repository';
import type { LegalDocumentRepository } from '../../domain/repositories/legal-document.repository';
import type { LegalDocumentType } from '../../domain/entities/legal-document.entity';

export interface CurrentLegalSummary {
  terms: { version: string; title: string; url: string } | null;
  privacy: { version: string; title: string; url: string } | null;
}

function publicPath(type: LegalDocumentType): string {
  return type === 'terms' ? '/syarat-ketentuan' : '/privacy-policy';
}

export class GetCurrentLegalUseCase {
  constructor(
    private readonly settingsRepo: AppSettingsRepository,
    private readonly legalRepo: LegalDocumentRepository,
  ) {}

  async execute(): Promise<CurrentLegalSummary> {
    const versions = await this.settingsRepo.getLegalActiveVersions();
    const base = env.webAppUrl.replace(/\/$/, '');

    const [termsDoc, privacyDoc] = await Promise.all([
      versions
        ? this.legalRepo.findByTypeAndVersion('terms', versions.termsVersion)
        : this.legalRepo.findPublishedByType('terms'),
      versions
        ? this.legalRepo.findByTypeAndVersion('privacy', versions.privacyVersion)
        : this.legalRepo.findPublishedByType('privacy'),
    ]);

    return {
      terms: termsDoc
        ? {
            version: termsDoc.version,
            title: termsDoc.title,
            url: `${base}${publicPath('terms')}`,
          }
        : null,
      privacy: privacyDoc
        ? {
            version: privacyDoc.version,
            title: privacyDoc.title,
            url: `${base}${publicPath('privacy')}`,
          }
        : null,
    };
  }
}

export class GetLegalDocumentUseCase {
  constructor(
    private readonly settingsRepo: AppSettingsRepository,
    private readonly legalRepo: LegalDocumentRepository,
  ) {}

  async execute(documentType: LegalDocumentType, version?: string) {
    if (version) {
      const doc = await this.legalRepo.findByTypeAndVersion(documentType, version);
      if (!doc || (doc.status !== 'published' && doc.status !== 'archived')) {
        throw new NotFoundError('LEGAL_DOCUMENT_NOT_FOUND', 'Dokumen legal tidak ditemukan');
      }
      return doc;
    }

    const active = await this.settingsRepo.getLegalActiveVersions();
    const activeVersion =
      documentType === 'terms' ? active?.termsVersion : active?.privacyVersion;

    if (activeVersion) {
      const doc = await this.legalRepo.findByTypeAndVersion(documentType, activeVersion);
      if (doc) return doc;
    }

    const published = await this.legalRepo.findPublishedByType(documentType);
    if (!published) {
      throw new NotFoundError('LEGAL_DOCUMENT_NOT_FOUND', 'Dokumen legal tidak ditemukan');
    }
    return published;
  }
}

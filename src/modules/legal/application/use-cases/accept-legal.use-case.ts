import type { AppSettingsRepository } from '../../domain/repositories/app-settings.repository';
import type { UserConsentRepository } from '../../domain/repositories/user-consent.repository';
import type { ConsentSource } from '../../domain/entities/user-consent.entity';
import type { ConsentInput } from '../utils/validate-consents';
import { assertConsentsMatchActiveVersions } from '../utils/validate-consents';

export class AcceptLegalUseCase {
  constructor(
    private readonly settingsRepo: AppSettingsRepository,
    private readonly consentRepo: UserConsentRepository,
  ) {}

  async execute(input: {
    userId: string;
    consents: ConsentInput[];
    clientId?: string | null;
    source?: ConsentSource;
    requestId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const active = await this.settingsRepo.getLegalActiveVersions();
    assertConsentsMatchActiveVersions(input.consents, active);

    const source = input.source ?? 'accept_legal';
    const uniqueTypes = ['terms', 'privacy'] as const;
    const byType = new Map(input.consents.map((c) => [c.documentType, c.documentVersion]));

    await this.consentRepo.insertMany(
      uniqueTypes.map((documentType) => ({
        userId: input.userId,
        documentType,
        documentVersion: byType.get(documentType)!,
        source,
        clientId: input.clientId ?? null,
        requestId: input.requestId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })),
    );

    return { accepted: true as const };
  }
}

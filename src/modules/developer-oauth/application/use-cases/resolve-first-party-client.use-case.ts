import { BadRequestError, ForbiddenError } from '@/shared/errors/app-error';
import {
  FIRST_PARTY_CLIENT_IDS,
  FIRST_PARTY_SCOPE_STRING,
  type ApiClientChannel,
} from '../../domain/entities/api-client.entity';
import type { ApiClientRepository } from '../../domain/repositories/api-client.repository';

export interface ResolveFirstPartyClientInput {
  /** Klaim client_id dari body; boleh kosong → default per channel. */
  clientId?: string | null;
  clientType: ApiClientChannel;
}

export interface ResolvedFirstPartyClient {
  clientId: string;
  scopes: string;
}

/**
 * Validasi klaim client_id untuk jalur login first-party (password/Google/FB).
 * Third-party harus lewat OAuth PKCE - ditolak di sini.
 */
export class ResolveFirstPartyClientUseCase {
  constructor(private readonly apiClients: ApiClientRepository) {}

  async execute(input: ResolveFirstPartyClientInput): Promise<ResolvedFirstPartyClient> {
    const claimed =
      (input.clientId?.trim() || null) ??
      (input.clientType === 'mobile'
        ? FIRST_PARTY_CLIENT_IDS.mobile
        : FIRST_PARTY_CLIENT_IDS.web);

    const client = await this.apiClients.findByClientId(claimed);
    if (!client) {
      throw new BadRequestError('CLIENT_MISMATCH', 'client_id tidak dikenal', [
        { field: 'client_id', message: 'Klien tidak terdaftar' },
      ]);
    }
    if (!client.isFirstParty) {
      throw new BadRequestError(
        'CLIENT_MISMATCH',
        'Klien third-party harus memakai OAuth, bukan login langsung',
        [{ field: 'client_id', message: 'Bukan klien first-party' }],
      );
    }
    if (client.status !== 'approved') {
      throw new ForbiddenError('CLIENT_NOT_ALLOWED', 'Klien tidak diizinkan', [
        { field: 'client_id', message: `Status: ${client.status}` },
      ]);
    }
    if (!client.allowedChannels.includes(input.clientType)) {
      throw new BadRequestError(
        'CLIENT_MISMATCH',
        `client_id ${claimed} tidak cocok dengan client_type ${input.clientType}`,
        [{ field: 'client_id', message: 'Saluran login tidak cocok' }],
      );
    }

    const scopes =
      client.allowedScopes.length > 0
        ? client.allowedScopes.join(' ')
        : FIRST_PARTY_SCOPE_STRING;

    return { clientId: client.clientId, scopes };
  }
}

import { describe, expect, it, vi } from 'vitest';
import { ResolveFirstPartyClientUseCase } from '../../application/use-cases/resolve-first-party-client.use-case';
import type { ApiClientRepository } from '../../domain/repositories/api-client.repository';
import type { ApiClient } from '../../domain/entities/api-client.entity';
import { FIRST_PARTY_SCOPE_STRING } from '../../domain/entities/api-client.entity';

function client(partial: Partial<ApiClient> & Pick<ApiClient, 'clientId'>): ApiClient {
  return {
    id: 'id-1',
    clientSecretHash: null,
    name: 'Test',
    description: null,
    ownerUserId: null,
    status: 'approved',
    isFirstParty: true,
    homepageUrl: null,
    privacyUrl: null,
    redirectUris: [],
    allowedScopes: FIRST_PARTY_SCOPE_STRING.split(' '),
    allowedChannels: ['mobile'],
    rateLimitTier: 'first_party',
    createdAt: new Date(),
    updatedAt: null,
    ...partial,
  };
}

describe('ResolveFirstPartyClientUseCase', () => {
  it('default mobile → sambasku-mobile', async () => {
    const repo: ApiClientRepository = {
      findByClientId: vi.fn().mockResolvedValue(
        client({ clientId: 'sambasku-mobile', allowedChannels: ['mobile'] }),
      ),
      findById: vi.fn(),
    };
    const uc = new ResolveFirstPartyClientUseCase(repo);
    const result = await uc.execute({ clientType: 'mobile' });
    expect(result.clientId).toBe('sambasku-mobile');
    expect(repo.findByClientId).toHaveBeenCalledWith('sambasku-mobile');
  });

  it('tolak third-party di jalur login langsung', async () => {
    const repo: ApiClientRepository = {
      findByClientId: vi.fn().mockResolvedValue(
        client({ clientId: 'evil-app', isFirstParty: false, allowedChannels: ['web'] }),
      ),
      findById: vi.fn(),
    };
    const uc = new ResolveFirstPartyClientUseCase(repo);
    await expect(uc.execute({ clientId: 'evil-app', clientType: 'web' })).rejects.toMatchObject({
      errorCode: 'CLIENT_MISMATCH',
    });
  });

  it('tolak channel mismatch (mobile id + web type)', async () => {
    const repo: ApiClientRepository = {
      findByClientId: vi.fn().mockResolvedValue(
        client({ clientId: 'sambasku-mobile', allowedChannels: ['mobile'] }),
      ),
      findById: vi.fn(),
    };
    const uc = new ResolveFirstPartyClientUseCase(repo);
    await expect(
      uc.execute({ clientId: 'sambasku-mobile', clientType: 'web' }),
    ).rejects.toMatchObject({ errorCode: 'CLIENT_MISMATCH' });
  });

  it('tolak klien suspended', async () => {
    const repo: ApiClientRepository = {
      findByClientId: vi.fn().mockResolvedValue(
        client({
          clientId: 'sambasku-web',
          status: 'suspended',
          allowedChannels: ['web'],
        }),
      ),
      findById: vi.fn(),
    };
    const uc = new ResolveFirstPartyClientUseCase(repo);
    await expect(uc.execute({ clientId: 'sambasku-web', clientType: 'web' })).rejects.toMatchObject({
      errorCode: 'CLIENT_NOT_ALLOWED',
    });
  });
});

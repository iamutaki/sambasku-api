import { describe, it, expect, vi } from 'vitest';
import { LookupLemmaDefinitionUseCase } from '../../application/use-cases/lookup-lemma-definition.use-case';
import type {
  LemmaDefinitionProviderPort,
  ProviderLemmaRaw,
} from '../../application/ports/lemma-definition-provider.port';
import type { LemmaDefinitionProviderRegistry } from '../../application/ports/lemma-definition-provider-registry.port';

function makeProvider(
  name: string,
  raw: ProviderLemmaRaw | null,
): LemmaDefinitionProviderPort {
  return {
    providerName: name,
    lookup: vi.fn().mockResolvedValue(raw),
  };
}

function makeRegistry(
  providers: Record<string, LemmaDefinitionProviderPort>,
  defaultId: string | null = 'raf555',
): LemmaDefinitionProviderRegistry {
  const map = new Map(Object.entries(providers));
  return {
    defaultId,
    availableIds: [...map.keys()],
    resolve(requestedId) {
      const id = requestedId?.trim() || defaultId;
      if (!id) throw Object.assign(new Error('unavailable'), { errorCode: 'LEMMA_DEFINITION_PROVIDER_UNAVAILABLE', statusCode: 503 });
      const p = map.get(id);
      if (!p) {
        const err = new Error('validation') as Error & {
          errorCode: string;
          details: { field: string; message: string }[];
        };
        err.errorCode = 'VALIDATION_ERROR';
        err.details = [{ field: 'provider', message: 'unknown' }];
        throw err;
      }
      return p;
    },
  };
}

const sampleRaw: ProviderLemmaRaw = {
  lemma: 'makan',
  entries: [
    {
      entry: 'ma.kan (1)',
      definitions: [
        {
          definition: 'memasukkan makanan ke mulut',
          labels: [{ code: 'v', name: 'Verba', kind: 'Kelas Kata' }],
          usageExamples: [],
        },
      ],
    },
  ],
};

describe('LookupLemmaDefinitionUseCase', () => {
  it('sukses: map provider → found + suggestions', async () => {
    const provider = makeProvider('raf555', sampleRaw);
    const useCase = new LookupLemmaDefinitionUseCase(
      makeRegistry({ raf555: provider }),
      0,
    );

    const result = await useCase.execute('Makan');

    expect(provider.lookup).toHaveBeenCalledWith('makan');
    expect(result.found).toBe(true);
    expect(result.provider).toBe('raf555');
    expect(result.cache_hit).toBe(false);
    expect(result.suggestions[0]!.definition).toContain('memasukkan');
  });

  it('provider null → found false (bukan throw)', async () => {
    const provider = makeProvider('raf555', null);
    const useCase = new LookupLemmaDefinitionUseCase(
      makeRegistry({ raf555: provider }),
      0,
    );

    const result = await useCase.execute('xyz');
    expect(result.found).toBe(false);
    expect(result.suggestions).toEqual([]);
  });

  it('cache hit per-provider (TTL > 0)', async () => {
    const provider = makeProvider('raf555', sampleRaw);
    const useCase = new LookupLemmaDefinitionUseCase(
      makeRegistry({ raf555: provider }),
      60,
    );

    const first = await useCase.execute('makan');
    const second = await useCase.execute('makan');

    expect(provider.lookup).toHaveBeenCalledTimes(1);
    expect(first.cache_hit).toBe(false);
    expect(second.cache_hit).toBe(true);
  });

  it('cache terpisah antar provider id', async () => {
    const p1 = makeProvider('raf555', sampleRaw);
    const p2: LemmaDefinitionProviderPort = {
      providerName: 'other',
      lookup: vi.fn().mockResolvedValue(sampleRaw),
    };
    const registry: LemmaDefinitionProviderRegistry = {
      defaultId: 'raf555',
      availableIds: ['raf555', 'other'],
      resolve(id) {
        if ((id ?? 'raf555') === 'other') return p2;
        return p1;
      },
    };
    const useCase = new LookupLemmaDefinitionUseCase(registry, 60);

    await useCase.execute('makan', 'raf555');
    await useCase.execute('makan', 'other');
    await useCase.execute('makan', 'raf555');

    expect(p1.lookup).toHaveBeenCalledTimes(1);
    expect(p2.lookup).toHaveBeenCalledTimes(1);
  });

  it('lemma kosong → VALIDATION_ERROR', async () => {
    const provider = makeProvider('raf555', null);
    const useCase = new LookupLemmaDefinitionUseCase(
      makeRegistry({ raf555: provider }),
      0,
    );

    await expect(useCase.execute('   ')).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
    });
    expect(provider.lookup).not.toHaveBeenCalled();
  });
});

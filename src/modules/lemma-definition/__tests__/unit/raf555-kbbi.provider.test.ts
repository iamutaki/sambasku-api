import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Raf555KbbiProvider } from '../../infrastructure/raf555-kbbi.provider';

describe('Raf555KbbiProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('200 → kembalikan raw lemma', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ lemma: 'makan', entries: [{ entry: 'ma.kan', definitions: [] }] }),
    }) as unknown as typeof fetch;

    const provider = new Raf555KbbiProvider('https://kbbi.example');
    const raw = await provider.lookup('makan');

    expect(raw?.lemma).toBe('makan');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://kbbi.example/api/v1/entry/makan',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('404 → null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: 'not found' }),
    }) as unknown as typeof fetch;

    const provider = new Raf555KbbiProvider('https://kbbi.example');
    await expect(provider.lookup('xyz')).resolves.toBeNull();
  });

  it('500 → LEMMA_DEFINITION_PROVIDER_ERROR', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'err' }),
    }) as unknown as typeof fetch;

    const provider = new Raf555KbbiProvider('https://kbbi.example');
    await expect(provider.lookup('makan')).rejects.toMatchObject({
      errorCode: 'LEMMA_DEFINITION_PROVIDER_ERROR',
      statusCode: 502,
    });
  });

  it('network failure → LEMMA_DEFINITION_PROVIDER_ERROR', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;

    const provider = new Raf555KbbiProvider('https://kbbi.example');
    await expect(provider.lookup('makan')).rejects.toMatchObject({
      errorCode: 'LEMMA_DEFINITION_PROVIDER_ERROR',
    });
  });
});

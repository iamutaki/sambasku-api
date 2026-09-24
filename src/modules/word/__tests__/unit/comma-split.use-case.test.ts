import { describe, expect, it, vi } from 'vitest';
import { splitCommaParts, normalizeSplitParts } from '../../application/utils/split-comma-parts';
import { ApplyCommaSplitUseCase } from '../../application/use-cases/apply-comma-split.use-case';
import { MarkCommaLiteralUseCase } from '../../application/use-cases/mark-comma-literal.use-case';
import { ListCommaSplitsUseCase } from '../../application/use-cases/list-comma-splits.use-case';

describe('splitCommaParts', () => {
  it('memisah dan trim bagian kosong', () => {
    expect(splitCommaParts('Pangkeng, Rasbang')).toEqual(['Pangkeng', 'Rasbang']);
    expect(splitCommaParts(' a , b ,  ')).toEqual(['a', 'b']);
    expect(splitCommaParts('satu')).toEqual(['satu']);
  });

  it('normalizeSplitParts membuang kosong', () => {
    expect(normalizeSplitParts(['a', '  ', 'b'])).toEqual(['a', 'b']);
  });
});

describe('ListCommaSplitsUseCase', () => {
  it('menghitung total kandidat', async () => {
    const wordRepo = {
      listCommaSplitCandidates: vi.fn().mockResolvedValue({
        lemmas: [{ wordId: '1' }],
        translations: [{ meaningTranslationId: '2' }, { meaningTranslationId: '3' }],
      }),
    };
    const useCase = new ListCommaSplitsUseCase(wordRepo as never);
    const result = await useCase.execute();
    expect(result.total).toBe(3);
    expect(result.lemmas).toHaveLength(1);
    expect(result.translations).toHaveLength(2);
  });
});

describe('ApplyCommaSplitUseCase', () => {
  it('menolak parts kurang dari 2', async () => {
    const useCase = new ApplyCommaSplitUseCase(
      { applyCommaSplitLemma: vi.fn() } as never,
      { record: vi.fn() } as never,
    );
    await expect(
      useCase.execute({
        kind: 'lemma',
        wordId: 'w1',
        parts: ['satu'],
        actorId: 'u1',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('menerapkan pecah lemma dan catat audit', async () => {
    const applyCommaSplitLemma = vi.fn().mockResolvedValue({
      wordId: 'w1',
      createdWordIds: ['w2'],
    });
    const record = vi.fn();
    const useCase = new ApplyCommaSplitUseCase(
      { applyCommaSplitLemma } as never,
      { record } as never,
    );
    const result = await useCase.execute({
      kind: 'lemma',
      wordId: 'w1',
      parts: ['Pangkeng', 'Rasbang'],
      actorId: 'u1',
    });
    expect(result).toEqual({
      kind: 'lemma',
      wordId: 'w1',
      createdWordIds: ['w2'],
    });
    expect(applyCommaSplitLemma).toHaveBeenCalledWith('w1', ['Pangkeng', 'Rasbang'], 'u1');
    expect(record).toHaveBeenCalled();
  });

  it('menerapkan pecah padanan ke makna', async () => {
    const applyCommaSplitTranslation = vi.fn().mockResolvedValue({
      wordId: 'w1',
      meaningIds: ['m1', 'm2'],
    });
    const useCase = new ApplyCommaSplitUseCase(
      { applyCommaSplitTranslation } as never,
      { record: vi.fn() } as never,
    );
    const result = await useCase.execute({
      kind: 'translation',
      meaningTranslationId: 't1',
      parts: ['kasur', 'tempat tidur'],
      actorId: 'u1',
    });
    expect(result.meaningIds).toEqual(['m1', 'm2']);
  });

  it('memetakan WORD_NOT_FOUND', async () => {
    const useCase = new ApplyCommaSplitUseCase(
      {
        applyCommaSplitLemma: vi.fn().mockRejectedValue(new Error('WORD_NOT_FOUND')),
      } as never,
      { record: vi.fn() } as never,
    );
    await expect(
      useCase.execute({
        kind: 'lemma',
        wordId: 'missing',
        parts: ['a', 'b'],
        actorId: 'u1',
      }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND' });
  });
});

describe('MarkCommaLiteralUseCase', () => {
  it('menandai lemma literal', async () => {
    const markLemmaAllowsComma = vi.fn().mockResolvedValue(true);
    const useCase = new MarkCommaLiteralUseCase(
      { markLemmaAllowsComma } as never,
      { record: vi.fn() } as never,
    );
    const result = await useCase.execute({
      kind: 'lemma',
      wordId: 'w1',
      actorId: 'u1',
    });
    expect(result).toEqual({ kind: 'lemma', id: 'w1' });
  });

  it('404 jika kata tidak ada', async () => {
    const useCase = new MarkCommaLiteralUseCase(
      { markLemmaAllowsComma: vi.fn().mockResolvedValue(false) } as never,
      { record: vi.fn() } as never,
    );
    await expect(
      useCase.execute({ kind: 'lemma', wordId: 'x', actorId: 'u1' }),
    ).rejects.toMatchObject({ errorCode: 'WORD_NOT_FOUND' });
  });
});

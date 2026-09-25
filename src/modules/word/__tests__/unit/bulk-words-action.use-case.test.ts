import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors/app-error';
import {
  BulkWordsActionUseCase,
  WORDS_BULK_MAX,
} from '../../application/use-cases/bulk-words-action.use-case';

function makeUseCase(opts?: {
  deleteImpl?: (cmd: { wordId: string }) => Promise<void>;
  publishImpl?: (cmd: {
    wordId: string;
    published: boolean;
  }) => Promise<{ wordId: string; mergedIntoWordId: string | null }>;
}) {
  const deleteWord = {
    execute: vi.fn(
      opts?.deleteImpl ??
        (async () => {
          /* ok */
        }),
    ),
  };
  const publishWord = {
    execute: vi.fn(
      opts?.publishImpl ??
        (async (cmd: { wordId: string }) => ({
          wordId: cmd.wordId,
          mergedIntoWordId: null,
        })),
    ),
  };
  return {
    deleteWord,
    publishWord,
    useCase: new BulkWordsActionUseCase(deleteWord as never, publishWord as never),
  };
}

describe('BulkWordsActionUseCase', () => {
  it('delete → soft-delete tiap id + hitung succeeded', async () => {
    const { deleteWord, useCase } = makeUseCase();
    const result = await useCase.execute({
      action: 'delete',
      ids: ['01AAAAAAAAAAAAAAAAAAAAAAAA', '01BBBBBBBBBBBBBBBBBBBBBBBB'],
      actorId: '01ADMIN',
      actorRole: 'admin',
    });
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(deleteWord.execute).toHaveBeenCalledTimes(2);
  });

  it('publish partial: merge + 404 per-id, bukan gagal total', async () => {
    const { publishWord, useCase } = makeUseCase({
      publishImpl: async (cmd) => {
        if (cmd.wordId === '01MISSING__________________') {
          throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
        }
        if (cmd.wordId === '01MERGE____________________') {
          return { wordId: '01TWIN_____________________', mergedIntoWordId: '01TWIN_____________________' };
        }
        return { wordId: cmd.wordId, mergedIntoWordId: null };
      },
    });

    const result = await useCase.execute({
      action: 'publish',
      ids: [
        '01OK_______________________',
        '01MERGE____________________',
        '01MISSING__________________',
      ],
      actorId: '01ADMIN',
      actorRole: 'reviewer',
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      id: '01OK_______________________',
      ok: true,
      merged_into_word_id: null,
    });
    expect(result.results[1]).toEqual({
      id: '01MERGE____________________',
      ok: true,
      merged_into_word_id: '01TWIN_____________________',
    });
    expect(result.results[2]).toMatchObject({
      id: '01MISSING__________________',
      ok: false,
      error_code: 'WORD_NOT_FOUND',
    });
    expect(publishWord.execute).toHaveBeenCalledTimes(3);
  });

  it('taken_down → failure item ConflictError, batch lanjut', async () => {
    const { useCase } = makeUseCase({
      publishImpl: async (cmd) => {
        if (cmd.wordId === '01DOWN_____________________') {
          throw new ConflictError(
            'WORD_ALREADY_MODERATED',
            'Entri ini ditarik. Pulihkan dulu sebelum mengubah status tayang.',
          );
        }
        return { wordId: cmd.wordId, mergedIntoWordId: null };
      },
    });

    const result = await useCase.execute({
      action: 'unpublish',
      ids: ['01DOWN_____________________', '01OK_______________________'],
      actorId: '01ADMIN',
      actorRole: 'admin',
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      ok: false,
      error_code: 'WORD_ALREADY_MODERATED',
    });
  });

  it('editor tidak boleh publish/unpublish', async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({
        action: 'publish',
        ids: ['01AAAAAAAAAAAAAAAAAAAAAAAA'],
        actorId: '01EDITOR',
        actorRole: 'editor',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('editor boleh delete', async () => {
    const { deleteWord, useCase } = makeUseCase();
    await useCase.execute({
      action: 'delete',
      ids: ['01AAAAAAAAAAAAAAAAAAAAAAAA'],
      actorId: '01EDITOR',
      actorRole: 'editor',
    });
    expect(deleteWord.execute).toHaveBeenCalled();
  });

  it('dedupe ids di batch yang sama', async () => {
    const { deleteWord, useCase } = makeUseCase();
    const id = '01AAAAAAAAAAAAAAAAAAAAAAAA';
    await useCase.execute({
      action: 'delete',
      ids: [id, id],
      actorId: '01ADMIN',
      actorRole: 'admin',
    });
    expect(deleteWord.execute).toHaveBeenCalledTimes(1);
  });

  it('tolak batch kosong / terlalu besar', async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({
        action: 'delete',
        ids: [],
        actorId: '01ADMIN',
        actorRole: 'admin',
      }),
    ).rejects.toMatchObject({ errorCode: 'WORDS_BULK_EMPTY' });

    await expect(
      useCase.execute({
        action: 'delete',
        ids: Array.from({ length: WORDS_BULK_MAX + 1 }, (_, i) =>
          `01${String(i).padStart(24, '0')}`,
        ),
        actorId: '01ADMIN',
        actorRole: 'admin',
      }),
    ).rejects.toMatchObject({ errorCode: 'WORDS_BULK_TOO_LARGE' });
  });
});

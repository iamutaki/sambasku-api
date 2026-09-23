import { describe, expect, it, vi } from 'vitest';
import { createMiddleware } from 'hono/factory';
import {
  createAdminSuggestionRoutes,
  createWordSuggestionRoutes,
} from '../../presentation/v1/word-suggestions.routes';
import type { WordSuggestionController } from '../../presentation/v1/word-suggestions.controller';

const WORD_ID = '01M2WKYMEC2NSMFAJX12P4V8HG';
const USER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

const validBody = {
  proposed_changes: { lemma: 'lading' },
  reason_code: 'typo',
};

const jsonHeaders = { 'content-type': 'application/json' };

describe('word-suggestions routes auth wiring', () => {
  it('POST /:id/suggest-edit tanpa token → 401, controller tidak dipanggil', async () => {
    const createSuggestion = vi.fn();
    const authenticate = createMiddleware(async (c) =>
      c.json({ success: false, error_code: 'UNAUTHORIZED', message: 'Token tidak disertakan', details: null }, 401),
    );
    const app = createWordSuggestionRoutes({
      controller: { createSuggestion } as unknown as WordSuggestionController,
      authenticate,
    });

    const res = await app.request(`/${WORD_ID}/suggest-edit`, {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: jsonHeaders,
    });

    expect(res.status).toBe(401);
    expect(createSuggestion).not.toHaveBeenCalled();
  });

  it('POST /:id/suggest-edit dengan user contributor → user_id dari context, bukan string kosong', async () => {
    const createSuggestion = vi.fn(
      async (
        c: { json: (body: unknown, status: number) => Response },
        _body: unknown,
        _userId: string,
        _wordId: string,
      ) => c.json({ success: true }, 201),
    );
    const authenticate = createMiddleware(async (c, next) => {
      c.set('user', { user_id: USER_ID, role: 'contributor' });
      await next();
    });
    const app = createWordSuggestionRoutes({
      controller: { createSuggestion } as unknown as WordSuggestionController,
      authenticate,
    });

    const res = await app.request(`/${WORD_ID}/suggest-edit`, {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: jsonHeaders,
    });

    expect(res.status).toBe(201);
    expect(createSuggestion).toHaveBeenCalledTimes(1);
    expect(createSuggestion.mock.calls[0]?.[2]).toBe(USER_ID);
    expect(createSuggestion.mock.calls[0]?.[2]).not.toBe('');
  });

  it('GET /word-suggestions tanpa token → 401 (admin antrean tidak boleh publik)', async () => {
    const listSuggestions = vi.fn();
    const authenticate = createMiddleware(async (c) =>
      c.json({ success: false, error_code: 'UNAUTHORIZED', message: 'Token tidak disertakan', details: null }, 401),
    );
    const app = createAdminSuggestionRoutes({
      controller: { listSuggestions } as unknown as WordSuggestionController,
      authenticate,
    });

    const res = await app.request('/word-suggestions');

    expect(res.status).toBe(401);
    expect(listSuggestions).not.toHaveBeenCalled();
  });
});

import { randomUUID } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { AppVariables } from '@/shared/types';

// requestId dipakai log aplikasi + jejak audit di DB (api-base-stack.md Section 14)
export const requestIdMiddleware = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const requestId = c.req.header('X-Request-Id') ?? randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    await next();
  },
);

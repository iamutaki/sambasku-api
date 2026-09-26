import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { ApiClientRepository } from '@/modules/developer-oauth/domain/repositories/api-client.repository';
import { FIRST_PARTY_SCOPE_STRING } from '@/modules/developer-oauth/domain/entities/api-client.entity';
import { env } from '@/shared/config/env';

type JsonStatus = 401 | 403;

function deny(c: Context, status: JsonStatus, error_code: string, message: string) {
  return c.json({ success: false as const, error_code, message, details: null }, status);
}

function hasScope(granted: string | undefined, required: string): boolean {
  if (!granted) return false;
  const set = new Set(granted.split(/\s+/).filter(Boolean));
  return set.has(required);
}

export interface RequireApprovedClientOptions {
  /** Scope wajib (mis. vote.write). Di-skip saat OAUTH_REQUIRE_AZP=false tanpa azp. */
  scope?: string;
}

/**
 * Gate write: JWT `azp` harus klien approved (+ scope bila diminta).
 * Mode `OAUTH_REQUIRE_AZP` (env, default false):
 * - false: token tanpa azp masih lolos (anggap first-party penuh) - backward-compat.
 * - true: tanpa azp → CLIENT_REQUIRED.
 */
export function createRequireApprovedClientMiddleware(
  apiClients: ApiClientRepository,
  opts: RequireApprovedClientOptions = {},
) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return deny(c, 401, 'UNAUTHORIZED', 'Token tidak disertakan');
    }

    if (!user.azp) {
      if (env.OAUTH_REQUIRE_AZP) {
        return deny(
          c,
          401,
          'CLIENT_REQUIRED',
          'Sesi tanpa client_id. Silakan masuk ulang atau perbarui aplikasi.',
        );
      }
      // Grace: map ke scope first-party penuh tanpa azp
      c.set('user', {
        ...user,
        azp: undefined,
        scope: FIRST_PARTY_SCOPE_STRING,
        legacyMapped: true,
      });
      await next();
      return;
    }

    const client = await apiClients.findByClientId(user.azp);
    if (!client || client.status !== 'approved') {
      return deny(
        c,
        403,
        'CLIENT_NOT_ALLOWED',
        'Sesi dari aplikasi tidak diizinkan. Silakan keluar dan masuk lagi.',
      );
    }

    const scope = user.scope ?? (client.isFirstParty ? FIRST_PARTY_SCOPE_STRING : '');
    if (opts.scope && !hasScope(scope, opts.scope)) {
      return deny(
        c,
        403,
        'INSUFFICIENT_SCOPE',
        `Token tidak punya scope ${opts.scope}`,
      );
    }

    c.set('user', {
      ...user,
      azp: client.clientId,
      scope,
      legacyMapped: false,
    });
    await next();
  });
}

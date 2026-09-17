import { env } from '@/shared/config/env';

// Logger JSON tipis via console.* — jalan identik di Node dan Cloudflare
// Workers (Workers Logs menangkap console; di Node bisa di-pipe ke
// `pino-pretty` CLI kalau mau human-readable). API sengaja meniru pino
// (logger.info(obj, 'msg') / logger.info('msg') / logger.error(err, 'msg'))
// supaya call-site tidak berubah sama sekali.

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// §17: staging menyamai production (level info) — hanya dev/test yang debug
const minLevel = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging' ? LEVELS.info : LEVELS.debug;

// Jaring pengaman yang sama dengan pino `redact` lama — password/token
// tidak pernah bocor ke log walau developer lupa menyaring (Section 14)
const REDACT_KEYS = new Set(['password', 'password_hash', 'token', 'access_token', 'refresh_token']);

function serialize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    const cause = (value as Error & { cause?: unknown }).cause;
    return {
      message: value.message,
      stack: value.stack, // pola pino err
      ...(cause !== undefined ? { cause: serialize(cause, depth + 1) } : {}),
    };
  }
  if (value === null || typeof value !== 'object' || depth >= 4) return value;
  if (Array.isArray(value)) return value.map((v) => serialize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k) && typeof v === 'string' ? '[REDACTED]' : serialize(v, depth + 1);
  }
  return out;
}

function emit(level: Level, first: unknown, second?: unknown): void {
  if (LEVELS[level] < minLevel) return;
  const [obj, msg] =
    typeof first === 'string' ? [{}, first] : [first ?? {}, (second as string | undefined) ?? ''];
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...(serialize(obj) as Record<string, unknown>),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (first: unknown, second?: unknown) => emit('debug', first, second),
  info: (first: unknown, second?: unknown) => emit('info', first, second),
  warn: (first: unknown, second?: unknown) => emit('warn', first, second),
  error: (first: unknown, second?: unknown) => emit('error', first, second),
};

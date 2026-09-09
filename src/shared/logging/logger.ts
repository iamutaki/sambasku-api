import pino from 'pino';
import { env } from '@/shared/config/env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' } // human-readable saat development
      : undefined, // JSON murni saat production
  redact: ['password', 'password_hash', 'token', 'access_token', 'refresh_token'],
});

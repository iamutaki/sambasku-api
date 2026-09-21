import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? '';
const authToken = process.env.DATABASE_AUTH_TOKEN;

export default defineConfig({
  dialect: 'turso',
  schema: './src/shared/database/drizzle/schema/*.schema.ts',
  out: './src/shared/database/drizzle/migrations',
  dbCredentials: url.startsWith('file:')
    ? { url }
    : { url, authToken: authToken ?? '' },
});

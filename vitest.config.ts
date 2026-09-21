import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Integration/e2e berbagi satu file SQLite — wajib serial (SQLITE_BUSY).
    fileParallelism: false,
    maxWorkers: 1,
  },
});

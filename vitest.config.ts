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
    // Integration/e2e berbagi satu database test — jalankan file test
    // berurutan supaya cleanup beforeEach antar file tidak saling serobot
    fileParallelism: false,
  },
});

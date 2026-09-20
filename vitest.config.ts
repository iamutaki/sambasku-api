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
    // Integration/e2e berbagi satu database test - jalankan file test
    // berurutan supaya cleanup beforeEach antar file tidak saling serobot.
    // maxWorkers:1 eksplisit - fileParallelism:false harus set ini, tapi
    // race FK di truncateAll pernah muncul saat worker > 1.
    fileParallelism: false,
    maxWorkers: 1,
  },
});

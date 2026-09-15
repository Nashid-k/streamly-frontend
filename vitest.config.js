import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    css: false,
    // NOTE: `pool: 'vmThreads'` + `poolOptions.vmThreads.isolate: false` was
    // tried for speed, but Vitest 5 removed `poolOptions` (deprecation warning)
    // and the pooled env caused 2 test failures + teardown RPC errors. Reverted
    // to the default pool so all 305 tests stay green.
  },
});

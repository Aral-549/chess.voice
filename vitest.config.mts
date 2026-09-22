import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // The move-analysis suite runs a real minimax per case, so it is CPU-bound
    // rather than IO-bound. The 5s default is enough locally and marginal on a
    // loaded CI runner, where three cases flaked once.
    testTimeout: 20_000,
    alias: {
      '@': path.resolve(dirname, './src')
    }
  }
});


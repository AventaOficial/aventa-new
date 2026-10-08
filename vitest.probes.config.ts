import path from 'path';
import { defineConfig } from 'vitest/config';

/** Sondas de retailers vivos. No las incluye `npm run ci:verify`. */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/probes/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'site/src/**/*.test.ts'],
    environment: 'node',
  },
});

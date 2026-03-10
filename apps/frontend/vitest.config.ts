import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    exclude: ['test/e2e/**'],
    setupFiles: ['src/test-setup.ts'],
    passWithNoTests: true,
  },
});

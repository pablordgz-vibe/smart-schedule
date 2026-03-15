import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      all: false,
      clean: true,
      provider: 'v8',
      reporter: ['json-summary', 'text'],
      reportsDirectory: './coverage',
    },
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    exclude: ['test/e2e/**'],
    setupFiles: ['src/test-setup.ts'],
    passWithNoTests: true,
  },
});

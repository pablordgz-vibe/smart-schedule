import swc from 'unplugin-swc';
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
    passWithNoTests: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});

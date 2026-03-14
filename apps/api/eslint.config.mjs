import config from '@smart-schedule/eslint-config';

export default [
  ...config,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**'],
  },
];

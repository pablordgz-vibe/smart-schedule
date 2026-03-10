import config from '@smart-schedule/eslint-config';

export default [
  ...config,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        allowDefaultProject: true,
      },
    },
  },
  {
    ignores: ['eslint.config.mjs', 'dist/**'],
  },
];

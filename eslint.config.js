// Flat ESLint config (ESLint 9 + typescript-eslint). Type-aware linting on the
// game source; catches the classes of bug tsc alone misses — floating promises,
// unused code, unsafe patterns. Prettier owns formatting (config disables the
// stylistic rules that would otherwise fight it).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // Build output, deps, generated art manifest, and config files.
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/art-manifest.ts',
      '.wrangler/**',
      'test-results/**',
      'playwright-report/**',
      // Root build/config files live outside the tsconfig project graph.
      '*.config.ts',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      // Correctness rules worth failing CI over.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Off: the codebase deliberately uses async interface/provider/mock methods
      // that satisfy a Promise-returning contract without awaiting internally.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Tests mock structural interfaces and stringify fixtures freely.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  {
    // Node context: build scripts, config, Cloudflare Functions, tests.
    files: ['*.config.{js,ts}', 'functions/**/*.ts', 'tests/**/*.ts', 'tools/**/*.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);

/**
 * ESLint Base Configuration
 *
 * Base ESLint rules for JavaScript/TypeScript projects.
 *
 * @module eslint/base
 */

export const baseConfig = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
  ],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Console warnings
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'warn',

    // Best practices
    'no-var': 'error',
    'prefer-const': 'error',
    'no-unused-vars': 'off',

    // Code style
    'semi': ['error', 'never'],
    'quotes': ['error', 'single', { avoidEscape: true }],
  },
}

export default baseConfig

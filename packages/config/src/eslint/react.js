/**
 * ESLint React Configuration
 *
 * React-specific ESLint rules.
 *
 * @module eslint/react
 */

import { baseConfig } from './base.js'

export const reactConfig = {
  ...baseConfig,
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    ...baseConfig.rules,
    // React specific rules
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
}

export default reactConfig

module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist/', 'node_modules/', 'mobile-app/', 'netlify/functions/'],
  rules: {
    'no-undef': 'off',
    'no-unused-vars': 'off',
    'no-useless-escape': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'react-hooks/rules-of-hooks': 'error',
  },
};

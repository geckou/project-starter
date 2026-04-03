module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript', 'prettier'],
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      impliedStrict: true,
      jsx: true,
    },
  },
  rules: {
    'arrow-parens': ['error', 'as-needed'],
    curly: ['error', 'multi-line'],
    'comma-dangle': ['error', 'always-multiline'],
    'key-spacing': [
      'error',
      {
        align: 'colon',
      },
    ],
    'no-multi-spaces': [
      'error',
      {
        exceptions: { VariableDeclarator: true },
      },
    ],
    'no-floating-decimal': 'off',
    'space-before-function-paren': ['error', 'always'],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
      },
    ],
    'import/order': [
      'warn',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      },
    ],
  },
}

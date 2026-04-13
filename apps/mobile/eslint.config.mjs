import { FlatCompat } from '@eslint/eslintrc'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

export default [
  {
    ignores: ['eslint.config.mjs', '.eslintrc.*'],
  },
  ...compat.extends('expo', 'prettier'),
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // フォーマット系ルールは Prettier に委譲
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      'import/no-unresolved': [
        'error',
        {
          ignore: [
            '^expo-notifications$',
            '^expo-device$',
            '^@sentry/react-native$',
          ],
        },
      ],
    },
  },
]

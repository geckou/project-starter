// Expo（React Native）アプリ向けのプリセット。
//
//   // apps/mobile/eslint.config.mjs
//   import expo from '@geckou/eslint-config/expo'
//
//   export default expo
//
// next.js と同じく FlatCompat の baseDirectory はこのパッケージ自身を指す。
// mobile 層を外すとこのファイルごと落ちる（layers.json）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

import { commonIgnores, sharedRules } from './rules.js'

const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
})

export default [
  { ignores: [...commonIgnores, '.expo/**'] },
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
      ...sharedRules,
      // 実行時にのみ存在する任意依存（層やプラットフォームで有無が変わる）
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

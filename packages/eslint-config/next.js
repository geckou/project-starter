// Next.js アプリ向けのプリセット。
//
//   // apps/web/eslint.config.mjs
//   import next from '@geckou/eslint-config/next'
//
//   export default next
//
// FlatCompat の baseDirectory はこのパッケージ自身を指す。next / prettier の
// 設定と、それが持ち込むプラグインはこのパッケージの依存として解決するため、
// 参照する側は eslint-config-next 等を持たなくてよい。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

import { commonIgnores, sharedRules } from './rules.js'

const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
})

export default [
  { ignores: [...commonIgnores, '.next/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      ...sharedRules,
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
  },
]

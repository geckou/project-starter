// React パッケージ向けのプリセット（Next.js を使わないコンポーネント
// ライブラリ等）。Next.js アプリは ./next を使う。
//
//   // eslint.config.mjs
//   import react from '@geckou/eslint-config/react'
//
//   export default react
//
// Hooks のルール（依存配列の漏れ・条件付き呼び出し）はテストで拾えない
// ため、このプリセットの主目的はそこにある。
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

import { commonIgnores, sharedRules } from './rules.js'

export default [
  { ignores: commonIgnores },
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    // flat config の同梱プリセットは版によって名前が変わる（recommended /
    // recommended-latest）ため、ルール定義だけを取り出して使う
    rules: reactHooks.configs.recommended.rules,
  },
  {
    rules: sharedRules,
  },
]

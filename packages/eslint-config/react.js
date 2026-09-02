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
    // v5 の configs.recommended は eslintrc 形式（plugins を含む）なので、
    // そのまま flat config に展開できない。ルール定義だけを取り出して使う。
    // v7 の recommended は React Compiler のルール群まで含み内容が別物なので、
    // 依存は ^5.0.0 に固定している
    rules: reactHooks.configs.recommended.rules,
  },
  {
    rules: sharedRules,
  },
]

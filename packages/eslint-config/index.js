// TypeScript パッケージ向けのプリセット（Cloud Functions・共有パッケージ等）。
//
//   // eslint.config.mjs
//   import geckou from '@geckou/eslint-config'
//
//   export default geckou
//
// Next.js / Expo のアプリは ./next / ./expo を使う。プリセットは互いに
// 独立していて、重ねて使わない（同じプラグインを別々の実体で登録すると
// ESLint が Cannot redefine plugin で落ちるため）。
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

import { commonIgnores, sharedRules, typescriptRules } from './rules.js'

export default tseslint.config(
  { ignores: commonIgnores },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      ...sharedRules,
      ...typescriptRules,
    },
  }
)

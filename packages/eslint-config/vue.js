// Vue 3 パッケージ向けのプリセット。
//
//   // eslint.config.mjs
//   import vue from '@geckou/eslint-config/vue'
//
//   export default vue
//
// .vue / .ts の両方を検査する。React と Vue が同居するリポジトリでは
// ./react を配列で後ろに並べる（プラグインの実体は各プリセットで
// 別々に登録されるため、files で対象を分けている限り衝突しない）。
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

import { commonIgnores, sharedRules, vueRules } from './rules.js'

export default [
  { ignores: commonIgnores },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    rules: {
      ...sharedRules,
      ...vueRules,
    },
  },
]

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
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

import { commonIgnores, sharedRules, vueRules } from './rules.js'

export default [
  { ignores: commonIgnores },
  js.configs.recommended,
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
    // .vue の script は TypeScript なので、未定義の識別子は vue-tsc が見る。
    // typescript-eslint は .ts にしか no-undef の無効化を当てないため、
    // ここで .vue にも当てる（当てないとブラウザのグローバルが全部 error になる）
    files: ['**/*.vue'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    rules: {
      ...sharedRules,
      ...vueRules,
    },
  },
]

// 各プリセットで共通の値。プラグインを読み込まないので、どのプリセットから
// 参照しても ESLint のプラグイン多重定義（Cannot redefine plugin）を起こさない。

// 生成物・ビルド成果物。どの構成でも検査しない
export const commonIgnores = [
  'node_modules/**',
  'dist/**',
  'coverage/**',
  '.turbo/**',
  'eslint.config.mjs',
  '.eslintrc.*',
]

// フォーマット系ルールは Prettier に委譲するため、ここには書かない
// （eslint-config-prettier で無効化済み。CLAUDE.md「コーディング規約」）
export const sharedRules = {
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
}

// 理由コメント付きの ts-ignore / ts-nocheck は許可する。
// next / expo のプリセットは各フレームワークの既定に任せるため、
// TypeScript 専用のプリセット（`.`）だけで使う
export const typescriptRules = {
  '@typescript-eslint/ban-ts-comment': [
    'error',
    {
      'ts-ignore': 'allow-with-description',
      'ts-nocheck': 'allow-with-description',
    },
  ],
}

// Vue のテンプレート記法に関する規約。属性・イベント名はケバブケースへ
// 変換せず、コンポーネント側の props / emits 名のまま書く
export const vueRules = {
  // 'multi-line' は Prettier の折り返しと衝突する（1 行だった if が
  // 折り返された瞬間に違反になる）。行の形に依存しない 'all' を使う
  curly: ['error', 'all'],
  // 1 語のコンポーネント名（Button.vue 等）を許可する
  'vue/multi-word-component-names': 'off',
  'vue/attribute-hyphenation': ['error', 'never', { ignore: ['custom-prop'] }],
  'vue/v-on-event-hyphenation': ['error', 'never', { autofix: false }],
}

// 共通の Prettier 設定（CLAUDE.md「コーディング規約」の「基本」）。
//
//   // .prettierrc.cjs
//   const geckou = require('@geckou/prettier-config')
//
//   module.exports = { ...geckou }
//
// Prettier には extends が無いため、参照する側は spread で受けて
// プロジェクト固有の項目（tailwindStylesheet 等）だけを足す。
//
// プラグインは名前ではなく解決済みの絶対パスで渡す。名前で書くと参照する側の
// 設定ファイルの位置から解決されるため、依存の巻き上げ方によっては見つからない。
module.exports = {
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 80,
  plugins: [require.resolve('prettier-plugin-tailwindcss')],
}

// 中身はテンプレート側の共有設定（@geckou/prettier-config）を参照する。コピーしない。
// tailwindStylesheet だけはプロジェクトの構成に依存するのでここで足す
// （Prettier には extends が無いため spread で受ける）。
const geckou = require('@geckou/prettier-config')

module.exports = {
  ...geckou,
  tailwindStylesheet: './apps/web/src/styles/globals.css',
}

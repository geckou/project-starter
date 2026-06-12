// lint-staged 設定
// monorepo 構成のため、ワークスペースごとに lint スクリプトを呼び出す
// （root に eslint.config がないため、root から eslint を直接実行できない）
module.exports = {
  '**/*': 'prettier --write --ignore-unknown',
  'apps/web/**/*.{ts,tsx,js,jsx}': () => 'yarn workspace @geckou/web lint',
  'apps/mobile/**/*.{ts,tsx,js,jsx}': () =>
    'yarn workspace @geckou/mobile lint',
  'apps/functions/**/*.{ts,js}': () => 'yarn workspace @geckou/functions lint',
  'packages/shared/**/*.{ts,tsx}': () => 'yarn workspace @geckou/shared lint',
}

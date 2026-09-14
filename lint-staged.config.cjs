// lint-staged 設定
// monorepo 構成のため、ワークスペースごとに lint スクリプトを呼び出す
// （root に eslint.config がないため、root から eslint を直接実行できない）
//
// **ワークスペース名（`@<スコープ>/web` 等）を書かない。** /init-project がスコープを
// 派生プロジェクトの名前へリネームするので、直書きすると存在しないワークスペースを
// 指して pre-commit が毎回落ちる（#360）。turbo の --filter はパスで指定できるので、
// リネームの影響を受けない（scripts/format.sh も同じ理由でパス指定を使っている）
module.exports = {
  '**/*': 'prettier --write --ignore-unknown',
  'apps/web/**/*.{ts,tsx,js,jsx}': () =>
    'yarn turbo run lint --filter=./apps/web',
  // layer:mobile:start
  'apps/mobile/**/*.{ts,tsx,js,jsx}': () =>
    'yarn turbo run lint --filter=./apps/mobile',
  // layer:mobile:end
  // layer:functions:start
  'apps/functions/**/*.{ts,js}': () =>
    'yarn turbo run lint --filter=./apps/functions',
  // layer:functions:end
  'packages/shared/**/*.{ts,tsx}': () =>
    'yarn turbo run lint --filter=./packages/shared',
}

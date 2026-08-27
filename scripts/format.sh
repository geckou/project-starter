#!/bin/bash
set -e

# Prettier の実行。--check を付けるとチェックのみ（書き換えない）。
#
# 先に packages/ をビルドする理由:
# prettier-plugin-tailwindcss は .prettierrc の tailwindStylesheet から
# apps/web/src/styles/globals.css → @config → apps/web/tailwind.config.ts と辿る。
# この設定は @geckou/shared/theme を import しており、exports が dist を指すため
# packages/shared がビルドされていないと解決に失敗する。
# その場合プラグインは既定の Tailwind 設定にフォールバックし、テンプレート独自の
# クラス（primary-* 等）を知らないまま異なる順序に並べ替える。
# MODULE_NOT_FOUND は Prettier の終了コードに影響しないため、黙って誤った結果になる。
#
# 実体を package.json ではなくこのスクリプトに置いているのは、
# ルート package.json が Template Sync の対象外（.templatesyncignore）だから。
# scripts/ と .github/workflows/ は同期対象なので、両者からこれを呼ぶ。

cd "$(dirname "$0")/.."
export PATH="$PWD/node_modules/.bin:$PATH"

# パッケージ名をハードコードしないディレクトリ指定。
# turbo のキャッシュが効くので、変更が無ければ実質ノーコスト
turbo build --filter='./packages/*'

if [ "${1:-}" = "--check" ]; then
  prettier --check .
else
  prettier --write .
fi

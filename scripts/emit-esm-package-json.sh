#!/usr/bin/env bash
# ESM ビルドの出力先に {"type": "module"} だけの package.json を置く。
#
# パッケージ本体は CJS（"type" 無し = commonjs）のまま保つ。apps/functions の
# ような require 側の利用者が exports の default 条件で dist を読むため。
# ESM の出力を .js のまま同じツリーに置くと Node もバンドラも CJS として
# 解釈するので、出力先にだけ type を上書きする package.json を置いて知らせる。
#
#   bash scripts/emit-esm-package-json.sh <出力先ディレクトリ>
set -euo pipefail

DIRECTORY="${1:?出力先ディレクトリを指定してください}"

if [ ! -d "$DIRECTORY" ]; then
  echo "ディレクトリがありません（先に ESM ビルドを実行してください）: $DIRECTORY" >&2
  exit 1
fi

printf '%s\n' '{ "type": "module" }' > "$DIRECTORY/package.json"

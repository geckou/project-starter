#!/bin/bash
set -e

# Firestore / Storage セキュリティルールのテスト。
# エミュレーターが必要なため yarn test には含めず、これを単独で実行する。
#
# 実体を package.json ではなくこのスクリプトに置いている理由:
# ルート package.json は Template Sync の対象外（.templatesyncignore）なので、
# コマンドを package.json に直接書くと変更が派生プロジェクトへ届かない。
# scripts/ と .github/workflows/ は同期対象なので、両者からこれを呼ぶ。

cd "$(dirname "$0")/.."

# emulators:exec は渡したコマンドを /bin/sh で実行するため、yarn 経由の
# 起動でないと node_modules/.bin が PATH に入らず vitest が見つからない。
# CI は yarn を介さずこのスクリプトを直接呼ぶので、ここで明示的に通す
export PATH="$PWD/node_modules/.bin:$PATH"

firebase emulators:exec \
  --only firestore,storage \
  --project demo-rules-test \
  --config firebase.rules-test.json \
  "vitest run tests/firestore-rules.test.ts tests/storage-rules.test.ts"

#!/bin/bash
set -e

# 使い方: bash scripts/deploy.sh [develop|staging|production] [--only functions|hosting]

ENV=${1:-develop}
ONLY_FLAG=""

if [ "$2" = "--only" ] && [ -n "$3" ]; then
  ONLY_FLAG="--only $3"
fi

echo "=== デプロイ: ${ENV} 環境 ==="
echo ""

# 環境の切り替え
bash scripts/use-env.sh "${ENV}"
echo ""

# デプロイ前チェック
echo "[check] 型チェック..."
yarn type-check

echo "[check] Lint..."
yarn lint

echo "[check] テスト..."
yarn test

echo "[check] ビルド..."
yarn build

echo ""
echo "[deploy] Firebase にデプロイ中..."

if [ -n "$ONLY_FLAG" ]; then
  firebase deploy ${ONLY_FLAG}
else
  firebase deploy
fi

echo ""
echo "=== デプロイ完了: ${ENV} ==="

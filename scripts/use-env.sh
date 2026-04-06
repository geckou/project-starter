#!/bin/bash
set -e

# 使い方: bash scripts/use-env.sh [develop|staging|production]

ENV=${1:-develop}

if [ ! -f ".env.${ENV}" ]; then
  echo "[error] .env.${ENV} が見つかりません"
  echo "  使い方: bash scripts/use-env.sh [develop|staging|production]"
  exit 1
fi

# .env.local にコピー
cp ".env.${ENV}" .env.local
echo "[done] .env.${ENV} → .env.local にコピーしました"

# Firebase プロジェクトを切り替え
firebase use "${ENV}" 2>/dev/null && echo "[done] Firebase プロジェクトを ${ENV} に切り替えました" || echo "[warn] firebase use ${ENV} に失敗しました（.firebaserc を確認してください）"

echo ""
echo "現在の環境: ${ENV}"

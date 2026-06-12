#!/bin/bash
set -e

# 使い方: bash scripts/use-env.sh [develop|staging|production]

ENV=${1:-develop}

if [ ! -f ".env.${ENV}" ]; then
  echo "[error] .env.${ENV} が見つかりません"
  echo "  作成: cp .env.example .env.${ENV} で作成し、値を入力してください"
  echo "  使い方: bash scripts/use-env.sh [develop|staging|production]"
  exit 1
fi

# .env.local にコピー（ルート + apps/web + apps/mobile）
# Next.js は apps/web/、Expo (app.config.ts) は apps/mobile/ の .env.local を読む
cp ".env.${ENV}" .env.local
cp ".env.${ENV}" apps/web/.env.local
cp ".env.${ENV}" apps/mobile/.env.local
echo "[done] .env.${ENV} → .env.local, apps/web/.env.local, apps/mobile/.env.local にコピーしました"

# Firebase プロジェクトを切り替え
firebase use "${ENV}" 2>/dev/null && echo "[done] Firebase プロジェクトを ${ENV} に切り替えました" || echo "[warn] firebase use ${ENV} に失敗しました（.firebaserc を確認してください）"

echo ""
echo "現在の環境: ${ENV}"

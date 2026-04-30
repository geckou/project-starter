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

# workspace 依存を一時削除（Cloud Build が npm registry から取得しようとするのを防ぐ）
cleanup_workspace_deps() {
  echo "[cleanup] workspace 依存を復元中..."
  git checkout apps/web/package.json apps/functions/package.json 2>/dev/null || true
}
trap cleanup_workspace_deps EXIT

echo "[predeploy] workspace 依存を一時削除..."
node -e "
  const fs = require('fs');
  ['apps/web/package.json', 'apps/functions/package.json'].forEach(p => {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (dep.startsWith('@geckou/')) delete pkg.dependencies[dep];
    }
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  });
"

echo "[deploy] Firebase にデプロイ中..."

if [ -n "$ONLY_FLAG" ]; then
  firebase deploy ${ONLY_FLAG}
else
  firebase deploy
fi

echo ""
echo "=== デプロイ完了: ${ENV} ==="

#!/bin/bash
set -e

# 使い方: bash scripts/deploy.sh [develop|staging|production] [--only functions|hosting]

ENV=${1:-develop}
DEPLOY_ONLY=""

if [ "$2" = "--only" ] && [ -n "$3" ]; then
  DEPLOY_ONLY="$3"
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

# framework hosting ターゲットを 1 つずつデプロイする。
# 複数の framework-backed Hosting ターゲットを 1 回の firebase deploy に
# 同梱すると Next アダプタが next build で停止（ハング）するため。
deploy_hosting_per_target() {
  local targets
  targets=$(node -e "
    const h = require('./firebase.json').hosting;
    if (!h) process.exit(0);
    const arr = Array.isArray(h) ? h : [h];
    process.stdout.write(arr.map((x) => x.target || x.site || '').filter(Boolean).join(' '));
  ")

  if [ -z "$targets" ]; then
    # hosting が単一・target/site 未設定（テンプレート既定）
    firebase deploy --only hosting --force
  else
    for t in $targets; do
      echo "[deploy] hosting:${t}..."
      firebase deploy --only "hosting:${t}" --force
    done
  fi
}

case "$DEPLOY_ONLY" in
  hosting)
    deploy_hosting_per_target
    ;;
  "")
    # 全体デプロイ: hosting 以外を先に、hosting はターゲットごとに
    firebase deploy --only functions,firestore --force
    deploy_hosting_per_target
    ;;
  *)
    firebase deploy --only "$DEPLOY_ONLY" --force
    ;;
esac

echo ""
echo "=== デプロイ完了: ${ENV} ==="

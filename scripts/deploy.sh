#!/bin/bash
set -e

# 使い方: bash scripts/deploy.sh [develop|staging|production] [--only functions|hosting]

cd "$(dirname "$0")/.."

ENV=${1:-develop}
DEPLOY_ONLY=""

if [ "$2" = "--only" ] && [ -n "$3" ]; then
  DEPLOY_ONLY="$3"
fi

# production は production ブランチからのみデプロイ可（FORCE_DEPLOY=1 で回避可能）
if [ "$ENV" = "production" ] && [ "${FORCE_DEPLOY:-0}" != "1" ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "production" ]; then
    echo "[error] production へのデプロイは production ブランチからのみ実行できます（現在: ${CURRENT_BRANCH}）"
    echo "  → どうしても必要な場合は FORCE_DEPLOY=1 を付けて実行してください"
    exit 1
  fi
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
# git checkout での復元はユーザーの未コミット変更ごと破棄してしまうため、
# バックアップコピーからの復元方式にする
BACKUP_DIR=$(mktemp -d)
cp apps/web/package.json "${BACKUP_DIR}/web-package.json"
cp apps/functions/package.json "${BACKUP_DIR}/functions-package.json"

cleanup_workspace_deps() {
  echo "[cleanup] workspace 依存を復元中..."
  cp "${BACKUP_DIR}/web-package.json" apps/web/package.json
  cp "${BACKUP_DIR}/functions-package.json" apps/functions/package.json
  rm -rf "${BACKUP_DIR}"
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

# framework-backed hosting (firebase.json の frameworksBackend) に必要
firebase experiments:enable webframeworks

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

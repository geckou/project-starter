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

# デプロイ前チェック。
# CI では同じチェックをワークフロー側で実行済みなので SKIP_CHECKS=1 で省略する。
# ローカル実行では既定で走る（環境変数を明示的に立てない限りスキップされない）
if [ "${SKIP_CHECKS:-0}" = "1" ]; then
  echo "[skip] SKIP_CHECKS=1 のためデプロイ前チェックを省略します（CI で実行済み）"
  echo ""
else
  echo "[check] 型チェック..."
  yarn type-check

  echo "[check] Lint..."
  yarn lint

  echo "[check] テスト..."
  yarn test

  echo "[check] ビルド..."
  yarn build

  echo ""
fi

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

# デプロイ対象（カンマ区切り）。
# CI は変更差分から必要なターゲットだけを渡してくる（.github/workflows/deploy.yml）
#
# storage は firebase.json が宣言している場合のみ既定の対象に含める。
# Cloud Storage を使わないプロジェクトは firebase.json の storage を削除すること
DEFAULT_TARGETS="functions,firestore,hosting"

if node -e "process.exit(require('./firebase.json').storage ? 0 : 1)" 2>/dev/null; then
  DEFAULT_TARGETS="functions,firestore,storage,hosting"
fi

TARGETS="${DEPLOY_ONLY:-$DEFAULT_TARGETS}"

DEPLOY_ALL_HOSTING=false
DEPLOY_STORAGE=false
HOSTING_TARGETS=()
OTHER_TARGETS=""

IFS=',' read -ra REQUESTED_TARGETS <<< "$TARGETS"
for target in "${REQUESTED_TARGETS[@]}"; do
  # 前後の空白を除去する（"functions, hosting" のような指定に備える）
  target="${target#"${target%%[![:space:]]*}"}"
  target="${target%"${target##*[![:space:]]}"}"
  if [ -z "$target" ]; then
    continue
  fi

  case "$target" in
    hosting)
      # firebase.json のターゲット全部。個別デプロイは下の関数が担当する
      DEPLOY_ALL_HOSTING=true
      ;;
    hosting:*)
      # hosting:<site> の個別指定。複数まとめて firebase へ渡すと
      # deploy_hosting_per_target が回避しているハングの条件を満たすため、
      # ここでも 1 ターゲットずつに分けて実行する
      HOSTING_TARGETS+=("$target")
      ;;
    storage)
      # Cloud Storage 未有効化時に失敗しうるため、他とまとめず個別に扱う
      DEPLOY_STORAGE=true
      ;;
    *)
      # functions:api のような個別指定はそのまま firebase へ渡す
      OTHER_TARGETS="${OTHER_TARGETS:+${OTHER_TARGETS},}${target}"
      ;;
  esac
done

if [ -z "$OTHER_TARGETS" ] &&
  [ "$DEPLOY_ALL_HOSTING" = false ] &&
  [ "$DEPLOY_STORAGE" = false ] &&
  [ ${#HOSTING_TARGETS[@]} -eq 0 ]; then
  echo "[error] デプロイ対象が空です（--only の値を確認してください）"
  exit 1
fi

if [ -n "$OTHER_TARGETS" ]; then
  echo "[deploy] ${OTHER_TARGETS}..."
  firebase deploy --only "$OTHER_TARGETS" --force
fi

# Storage ルールは hosting より先に当てる。
# ルールに依存するアプリを先に公開してしまわないためと、
# 設定不備なら hosting の長いデプロイに入る前に落とすため
if [ "$DEPLOY_STORAGE" = true ]; then
  echo "[deploy] storage..."
  if ! firebase deploy --only storage --force; then
    echo ""
    echo "[error] Storage ルールのデプロイに失敗しました"
    echo "  Cloud Storage が有効化されていない可能性があります。"
    echo "  - 使う場合: Firebase コンソールで Storage を有効化してください"
    echo "  - 使わない場合: firebase.json の storage を削除してください"
    exit 1
  fi
fi

if [ "$DEPLOY_ALL_HOSTING" = true ]; then
  deploy_hosting_per_target
fi

for hosting_target in ${HOSTING_TARGETS[@]+"${HOSTING_TARGETS[@]}"}; do
  echo "[deploy] ${hosting_target}..."
  firebase deploy --only "$hosting_target" --force
done

echo ""
echo "=== デプロイ完了: ${ENV} ==="

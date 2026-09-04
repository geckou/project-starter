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
# バックアップコピーからの復元方式にする。
# 対象は層構成によって変わるため、ここを唯一の一覧にする（layers.json 参照）
WORKSPACE_PACKAGE_JSONS=(apps/web/package.json)
# layer:functions:start
WORKSPACE_PACKAGE_JSONS+=(apps/functions/package.json)
# layer:functions:end

backup_path() {
  printf '%s/%s' "${BACKUP_DIR}" "$(printf '%s' "$1" | tr '/' '_')"
}

BACKUP_DIR=$(mktemp -d)

for workspace_package in "${WORKSPACE_PACKAGE_JSONS[@]}"; do
  cp "${workspace_package}" "$(backup_path "${workspace_package}")"
done

cleanup_workspace_deps() {
  echo "[cleanup] workspace 依存を復元中..."
  for workspace_package in "${WORKSPACE_PACKAGE_JSONS[@]}"; do
    cp "$(backup_path "${workspace_package}")" "${workspace_package}"
  done
  rm -rf "${BACKUP_DIR}"
}
trap cleanup_workspace_deps EXIT

echo "[predeploy] workspace 依存を一時削除..."
# 削除するのは「このリポジトリのワークスペース」だけ。スコープ前置き（@geckou/）で
# 判定すると、npm へ公開しているパッケージ（@geckou/ui-react / @geckou/billing /
# @geckou/firebase-server 等）まで消え、registry から取り直せなくなる。
# ルート package.json の workspaces を展開して実在する name の集合を作るので、
# 派生でスコープをリネームしても動く
node -e "
  const fs = require('fs');
  const path = require('path');

  const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const root = readJson('package.json');
  const patterns = Array.isArray(root.workspaces)
    ? root.workspaces
    : root.workspaces?.packages ?? [];

  // 展開するのは 'apps/*' のような末尾 1 段のワイルドカードと、直接指定のパス
  const directories = new Set();

  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      directories.add(pattern);
      continue;
    }

    // 末尾の / は付いたままでよい（existsSync も readdirSync も受け付ける）。
    // ここで正規表現を書くと、シェルのエスケープを通った後の姿が読みにくくなる
    const base = pattern.slice(0, pattern.indexOf('*'));
    if (!fs.existsSync(base)) continue;

    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) directories.add(path.join(base, entry.name));
    }
  }

  const workspaceNames = new Set();

  for (const directory of directories) {
    const manifest = path.join(directory, 'package.json');
    if (!fs.existsSync(manifest)) continue;

    const name = readJson(manifest).name;
    if (name) workspaceNames.add(name);
  }

  process.argv.slice(1).forEach(p => {
    const pkg = readJson(p);
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (workspaceNames.has(dep)) delete pkg.dependencies[dep];
    }
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  });
" "${WORKSPACE_PACKAGE_JSONS[@]}"

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

# firebase.json が storage を宣言しているか。
# 宣言がないプロジェクトで firebase deploy --only storage を実行すると
# 対象が見つからず失敗するため、既定・明示指定の双方でここを見る
storage_configured() {
  node -e "process.exit(require('./firebase.json').storage ? 0 : 1)" 2>/dev/null
}

# デプロイ対象（カンマ区切り）。
# CI は変更差分から必要なターゲットだけを渡してくる（.github/workflows/deploy.yml）
DEFAULT_TARGETS="hosting"
# layer:firebase:start
DEFAULT_TARGETS="firestore,${DEFAULT_TARGETS}"

if storage_configured; then
  DEFAULT_TARGETS="firestore,storage,hosting"
fi
# layer:firebase:end
# layer:functions:start
DEFAULT_TARGETS="functions,${DEFAULT_TARGETS}"
# layer:functions:end

TARGETS="${DEPLOY_ONLY:-$DEFAULT_TARGETS}"

DEPLOY_ALL_HOSTING=false
DEPLOY_STORAGE=false
SKIPPED_TARGET=false
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
      # Cloud Storage 未有効化時に失敗しうるため、他とまとめず個別に扱う。
      # --only で明示指定された場合もここで firebase.json を確認する
      # （CI は常に --only を渡すため、既定値側のガードだけでは素通りする）
      if storage_configured; then
        DEPLOY_STORAGE=true
      else
        echo "[skip] firebase.json に storage の宣言がないため Storage ルールのデプロイを省略します"
        SKIPPED_TARGET=true
      fi
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
  # 指定自体はあったが、この構成では対象外だったケース（storage 未宣言など）。
  # 指定ミスとは区別して正常終了する
  if [ "$SKIPPED_TARGET" = true ]; then
    echo "[done] このプロジェクトでデプロイ対象になるものはありませんでした"
    exit 0
  fi

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

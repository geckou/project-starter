#!/bin/bash
set -e

# 使い方: bash scripts/deploy.sh [develop|staging|production] [--only functions|hosting]
#
# **派生プロジェクトがこのファイルを書き換えるときも保つ約束**（`.templatesyncignore` で
# 同期対象外なので、書き換えた版がそのまま使われる）:
#
#   - `SKIP_CHECKS=1` でデプロイ前チェック（type-check / lint / test / build）を省略できること
#
# 同期される側がこれに依存している。`.github/workflows/deploy.yml` は同じチェックを
# ワークフローの step で済ませたうえで `SKIP_CHECKS=1` を渡し（二重実行の回避）、
# `scripts/test-env-distribution.sh` の [6] は node_modules の無い一時ツリーで
# このスクリプトを回すため、省略できないとそこで止まる。

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

# 退避先はリポジトリ内の決まった場所にする（.gitignore 済み）。
#
# **trap では取りこぼす。** 本物の Ctrl-C はフォアグラウンドのプロセスグループ全体に
# SIGINT を送り、待機中の子が SIGINT で死ぬと bash 自身も SIGINT で終了するため、
# EXIT / INT トラップのどちらも走らないまま終わることがある（実測）。
# 退避した env は .gitignore の対象で git からも戻せないので、
# 「次に deploy.sh を実行したとき、残骸があれば戻す」経路を別に用意する
DEPLOY_STASH_DIR=.deploy-env-stash

stash_path() {
  printf '%s/%s' "${DEPLOY_STASH_DIR}" "$(printf '%s' "$1" | tr '/' '_')"
}

# 前回の中断で残った退避を戻してから始める。
# 既にファイルが在る場合は触らない（use-env.sh が作り直した新しい値を、
# 古い退避で上書きしないため）
restore_stashed_env() {
  [ -d "${DEPLOY_STASH_DIR}" ] || return 0

  local stashed original restored
  restored=0

  for stashed in "${DEPLOY_STASH_DIR}"/*; do
    [ -f "${stashed}" ] || continue

    original="apps/web/$(basename "${stashed}" | sed 's/^apps_web_//')"

    if [ ! -f "${original}" ]; then
      cp "${stashed}" "${original}"
      restored=$((restored + 1))
    fi

    rm -f "${stashed}"
  done

  rmdir "${DEPLOY_STASH_DIR}" 2>/dev/null || true

  if [ "${restored}" -gt 0 ]; then
    echo "[predeploy] 中断した前回のデプロイで退避した env を ${restored} 件戻しました"
  fi
}

# 中断した前回のデプロイの退避が残っていれば戻す（use-env.sh が作り直す前に）
restore_stashed_env

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

# デプロイ中だけ退避する env ファイル。
#
# framework-backed hosting は **apps/web/.env.* を丸ごと**関数のソースへ同梱する
# （firebase-tools 14 の lib/frameworks/index.js が glob('.env.*') でコピーし、
# lib/deploy/functions/prepareFunctionsUpload.js の既定 ignore は dotfile を外さない）。
# apps/web/.env.local は .env.<環境名> の全文コピーなので、そのままだと
# FIREBASE_SERVICE_ACCOUNT_KEY のようなサーバー秘密まで関数に載る（#329）。
#
# 退避するのは .env.local だけでなく **.env.* に一致するもの全部**。
# .gitignore は .env.development.local / .env.production.local / .env.test.local も
# 想定しており、アダプタはそれらも同じように同梱する。
# apps/web/.env は残す（next build と SSR がこれを読む。中身は許可リストと
# NEXT_PUBLIC_* だけで、scripts/use-env.sh が生成する）
# 退避によって SSR 関数へ届かなくなる値を知らせる。
#
# これまでは apps/web/.env.local（.env.<環境名> の全文コピー）が関数へ同梱され、
# Next.js が実行時に読んでいた。退避したあと SSR に届くのは apps/web/.env だけなので、
# **許可リストに載せ忘れた値は例外もログも出さずに undefined になる。**
# デプロイ済みの本番で初めて分かる壊れ方なので、ここで一覧を出す
warn_env_not_reaching_ssr() {
  local missing

  # NEXT_PUBLIC_* は apps/web/.env が持つので除く。
  # コメント行と空行も除く
  missing=$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' ".env.${ENV}" | sed 's/=$//' |
    grep -v '^NEXT_PUBLIC_' | sort -u |
    while IFS= read -r key; do
      grep -qE "^${key}=" apps/web/.env || printf '%s\n' "${key}"
    done)

  if [ -n "${missing}" ]; then
    echo ""
    echo "[note] 次の値は SSR 関数（middleware・Server Component）に届きません:"
    printf '%s\n' "${missing}" | sed 's/^/  - /'
    echo "  SSR で読むものがあれば scripts/use-env.sh の WEB_SSR_ENV_KEYS に足してください。"
    echo "  Mobile / Functions 専用の値なら、このままで問題ありません。"
    echo ""
  fi
}

STASHED_ENV_FILES=()

stash_local_env() {
  local env_file

  mkdir -p "${DEPLOY_STASH_DIR}"

  for env_file in apps/web/.env.*; do
    # グロブが 1 件も一致しないとパターン文字列がそのまま入る
    [ -f "${env_file}" ] || continue

    cp "${env_file}" "$(stash_path "${env_file}")"
    rm -f "${env_file}"
    STASHED_ENV_FILES+=("${env_file}")
    echo "[predeploy] ${env_file} を退避しました（関数へ同梱させないため）"
  done

  if [ ${#STASHED_ENV_FILES[@]} -eq 0 ]; then
    rmdir "${DEPLOY_STASH_DIR}" 2>/dev/null || true
  else
    warn_env_not_reaching_ssr
    # 中断でトラップを取りこぼしても、次の yarn deploy:<環境名> が戻す。
    # すぐ戻したいときは yarn env:<環境名> で作り直せる
    echo "[predeploy] 退避先: ${DEPLOY_STASH_DIR}（中断しても次回のデプロイで戻します）"
  fi
}

# 復元は 1 回だけ行う。INT / TERM でハンドラが走ったあと EXIT でも呼ばれるため
CLEANUP_DONE=false

cleanup_deploy_state() {
  if [ "${CLEANUP_DONE}" = true ]; then
    return 0
  fi
  CLEANUP_DONE=true

  # **消えると復旧できないものから先に戻す。** workspace の package.json は
  # git 管理下なので最悪 checkout で戻せるが、env ファイルは .gitignore の対象で
  # 戻せない。この関数は set -e の下で走るため、途中で失敗すると以降は実行されない
  local env_file
  for env_file in ${STASHED_ENV_FILES[@]+"${STASHED_ENV_FILES[@]}"}; do
    if [ -f "$(stash_path "${env_file}")" ]; then
      cp "$(stash_path "${env_file}")" "${env_file}"
      rm -f "$(stash_path "${env_file}")"
    fi
  done
  rmdir "${DEPLOY_STASH_DIR}" 2>/dev/null || true

  echo "[cleanup] workspace 依存を復元中..."
  local workspace_package
  for workspace_package in "${WORKSPACE_PACKAGE_JSONS[@]}"; do
    cp "$(backup_path "${workspace_package}")" "${workspace_package}" || true
  done

  rm -rf "${BACKUP_DIR}"
}

# EXIT だけでは足りない。**本物の Ctrl-C** はフォアグラウンドのプロセスグループ全体に
# SIGINT を送るため、EXIT トラップが走らないまま終わる。退避した env は .gitignore の
# 対象で git からも戻せないので、シグナルでも必ず復元する
trap cleanup_deploy_state EXIT INT TERM HUP

echo "[predeploy] workspace 依存を一時削除..."
# 削除するのは「このリポジトリのワークスペース」だけ。スコープ前置き（@geckou/）で
# 判定すると、npm へ公開しているパッケージ（@geckou/ui-react / @geckou/billing /
# @geckou/firebase-server 等）まで消え、registry から取り直せなくなる（#198）。
# 実在する name の集合は scripts/lib/workspace-names.mjs が作る。
# scripts/test-deploy-install.sh が同じものを使って、ここで作られる形を検査する
#
# 動的 import なので、失敗しても握り潰されないよう catch で明示的に落とす
node -e "
  const fs = require('fs');
  const targets = process.argv.slice(1);

  import('./scripts/lib/workspace-names.mjs')
    .then(({ workspaceNames, withoutWorkspaceDependencies }) => {
      const names = workspaceNames('.');

      for (const target of targets) {
        const pkg = JSON.parse(fs.readFileSync(target, 'utf8'));
        pkg.dependencies = withoutWorkspaceDependencies(pkg.dependencies, names);
        fs.writeFileSync(target, JSON.stringify(pkg, null, 2) + '\\n');
      }
    })
    .catch((error) => {
      console.error('[error] workspace 依存を落とせませんでした: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(1);
    });
" "${WORKSPACE_PACKAGE_JSONS[@]}"

stash_local_env

echo "[deploy] Firebase にデプロイ中..."

# framework-backed hosting (firebase.json の frameworksBackend) に必要
firebase experiments:enable webframeworks

# framework hosting ターゲットを 1 つずつデプロイする。
# 複数の framework-backed Hosting ターゲットを 1 回の firebase deploy に
# 同梱すると Next アダプタが next build で停止（ハング）するため。
#
# **配る先は今の環境のターゲットだけ。** 1 つの Firebase プロジェクトに develop /
# staging / production の 3 サイトを相乗りさせる構成（→ .claude/docs/git-workflow.md）
# では firebase.json に 3 ターゲットが並び、全部に配ると staging の .env でビルドした
# ものが production のサイトにも出る（#323）。選び方は scripts/lib/hosting-targets.mjs
deploy_hosting_per_target() {
  local targets
  targets=$(node scripts/lib/hosting-targets.mjs "$ENV")

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

DEPLOY_HOSTING=false
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
      # ターゲットの選択と個別デプロイは deploy_hosting_per_target が担当する
      DEPLOY_HOSTING=true
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
  [ "$DEPLOY_HOSTING" = false ] &&
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

if [ "$DEPLOY_HOSTING" = true ]; then
  deploy_hosting_per_target
fi

for hosting_target in ${HOSTING_TARGETS[@]+"${HOSTING_TARGETS[@]}"}; do
  echo "[deploy] ${hosting_target}..."
  firebase deploy --only "$hosting_target" --force
done

echo ""
echo "=== デプロイ完了: ${ENV} ==="

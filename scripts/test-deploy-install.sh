#!/usr/bin/env bash
set -u

# **デプロイ時に npm が実際に解決する package.json** で、解決が通るかを検査する。
#
# firebase deploy は、リポジトリの package.json をそのまま使わない。
#
#   1. Cloud Functions — scripts/deploy.sh が apps/functions/package.json から
#      ワークスペース依存（@<スコープ>/…）を落とし、そのディレクトリを丸ごと上げる。
#      Cloud Build はそこで npm install する
#   2. framework-backed hosting の SSR 関数 — アダプタが apps/web の dependencies に
#      firebase-frameworks を足した package.json を .firebase/<サイト>/functions/ に
#      生成し、そこで npm i してから Cloud Build が npm ci する
#
# どちらも「手元の yarn install が通る」ことと無関係に壊れる。実際に、依存の
# セキュリティ更新が入っただけで両方が別々の理由で落ち、デプロイが 1 日以上
# 止まったことがある（yarn / CI は緑のまま）。ここで先に落とす。
#
# 検査するもの:
#   [1] Cloud Functions のソースで npm install が通る（functions 層のみ）
#   [2] SSR 関数の生成物で npm i → npm ci が通る（frameworksBackend のときのみ）
#
# **npm レジストリへの通信が要る。** オフラインでは検査できないので、その場合は
# 失敗ではなくスキップとして報告する。

cd "$(dirname "$0")/.."
REPO=$(pwd)

# アダプタが生成する package.json に足す依存。firebase-tools の
# lib/frameworks/index.js が書くものに合わせる。firebase-tools 側が変えたら
# ここも変える（合っていないと、この検査は実際と違う形を見ることになる）
FRAMEWORKS_DEP='^0.11.0'

passed=0
failed=0
skipped=0

pass() {
  passed=$((passed + 1))
  echo "  [ok] $1"
}

fail() {
  failed=$((failed + 1))
  echo "  [NG] $1"
  if [ -n "${2:-}" ]; then
    echo "$2" | sed 's/^/       /'
  fi
}

skip() {
  skipped=$((skipped + 1))
  echo "  [--] $1"
}

if ! command -v npm >/dev/null 2>&1; then
  echo "npm が見つかりません。" >&2
  exit 1
fi

WORK=$(mktemp -d) || exit 1

if [ -z "$WORK" ] || [ ! -d "$WORK" ]; then
  echo "作業ディレクトリを作れませんでした。" >&2
  exit 1
fi

trap 'rm -rf "$WORK"' EXIT

# レジストリに届くか。届かないなら以降は検査そのものが成り立たない
if ! npm view npm version >/dev/null 2>&1; then
  echo "=== デプロイ時の npm 解決 ==="
  echo ""
  skip "npm レジストリに接続できないため検査しない"
  echo ""
  echo "=== 結果: 0 件成功 / 0 件失敗 / 1 件スキップ ==="
  exit 0
fi

echo "=== デプロイ時の npm 解決 ==="
echo ""

# --- [1] Cloud Functions のソース ---
echo "[1] Cloud Functions のソースで npm install が通る"

if [ ! -f "$REPO/apps/functions/package.json" ]; then
  skip "apps/functions が無い（functions 層を持たない構成）"
else
  mkdir -p "$WORK/functions"

  # 削り方は scripts/deploy.sh と**同じ実装**を使う（scripts/lib/workspace-names.mjs）。
  # ここを別に書くと、実際に上がるものと違う形を検査することになる
  if ! node --input-type=module -e "
    import { readFileSync, writeFileSync } from 'node:fs'
    import { workspaceNames, withoutWorkspaceDependencies } from '$REPO/scripts/lib/workspace-names.mjs'

    const pkg = JSON.parse(readFileSync('$REPO/apps/functions/package.json', 'utf8'))
    pkg.dependencies = withoutWorkspaceDependencies(pkg.dependencies, workspaceNames('$REPO'))

    writeFileSync('$WORK/functions/package.json', JSON.stringify(pkg, null, 2))
  " 2>"$WORK/gen.log"; then
    fail "apps/functions/package.json を読めない" "$(cat "$WORK/gen.log")"
  else
    # .npmrc は同じディレクトリごと上がるので、あるならそのまま持っていく
    if [ -f "$REPO/apps/functions/.npmrc" ]; then
      cp "$REPO/apps/functions/.npmrc" "$WORK/functions/.npmrc"
    fi

    if (cd "$WORK/functions" && npm install --package-lock-only --no-audit --no-fund >"$WORK/fn.log" 2>&1); then
      pass "apps/functions の依存を npm が解決できる"
    else
      fail "apps/functions の依存を npm が解決できない（Cloud Build で落ちる）" \
        "$(tail -20 "$WORK/fn.log")
実際に上がるのは、ワークスペース依存を落とした apps/functions/package.json です。
apps/functions/.npmrc で解決の方針を変えられます。"
    fi
  fi
fi

echo ""

# --- [2] framework-backed hosting の SSR 関数 ---
echo "[2] SSR 関数の生成物で npm i → npm ci が通る"

HOSTING_SOURCE=$(node -e "
  const fs = require('fs')

  try {
    const config = JSON.parse(fs.readFileSync('$REPO/firebase.json', 'utf8'))
    const entries = [].concat(config.hosting || [])
    const backed = entries.find((it) => it && it.frameworksBackend && it.source)
    process.stdout.write(backed ? backed.source : '')
  } catch {
    process.stdout.write('')
  }
" 2>/dev/null)

if [ -z "$HOSTING_SOURCE" ]; then
  skip "frameworksBackend の hosting が無い（SSR 関数を作らない構成）"
elif [ ! -f "$REPO/$HOSTING_SOURCE/package.json" ]; then
  skip "$HOSTING_SOURCE/package.json が無い"
else
  mkdir -p "$WORK/ssr"

  # アダプタが読むのは、deploy.sh が workspace 依存を落としたあとの package.json
  node --input-type=module -e "
    import { readFileSync, writeFileSync } from 'node:fs'
    import { workspaceNames, withoutWorkspaceDependencies } from '$REPO/scripts/lib/workspace-names.mjs'

    const app = JSON.parse(readFileSync('$REPO/$HOSTING_SOURCE/package.json', 'utf8'))
    const dependencies = withoutWorkspaceDependencies(app.dependencies, workspaceNames('$REPO'))

    dependencies['firebase-frameworks'] = '$FRAMEWORKS_DEP'

    writeFileSync(
      '$WORK/ssr/package.json',
      JSON.stringify({ name: 'ssr', version: '1.0.0', dependencies }, null, 2)
    )
  "

  # アダプタは hosting の source の .npmrc を生成先へコピーする
  if [ -f "$REPO/$HOSTING_SOURCE/.npmrc" ]; then
    cp "$REPO/$HOSTING_SOURCE/.npmrc" "$WORK/ssr/.npmrc"
  fi

  if (cd "$WORK/ssr" && npm install --package-lock-only --omit dev --no-audit --no-fund >"$WORK/ssr-i.log" 2>&1); then
    pass "$HOSTING_SOURCE の依存 + firebase-frameworks を npm が解決できる"

    # Cloud Build が使うのは npm ci。install は通っても ci は理想ツリーを
    # 組み直すので、peer の食い違いはここで初めて出ることがある
    if (cd "$WORK/ssr" && npm ci --omit dev --no-audit --dry-run >"$WORK/ssr-ci.log" 2>&1); then
      pass "生成される package-lock.json で npm ci が通る"
    else
      fail "npm ci が通らない（Cloud Build で落ちる）" \
        "$(tail -20 "$WORK/ssr-ci.log")
npm install は peer の衝突を黙って通しますが、npm ci は拒否します。
$HOSTING_SOURCE/.npmrc で解決の方針を変えられます（アダプタが生成先へコピーします）。"
    fi
  else
    fail "$HOSTING_SOURCE の依存 + firebase-frameworks を npm が解決できない" \
      "$(tail -20 "$WORK/ssr-i.log")"
  fi
fi

echo ""
echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 / ${skipped} 件スキップ ==="

[ "$failed" -eq 0 ]

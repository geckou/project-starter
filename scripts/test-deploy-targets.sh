#!/usr/bin/env bash
set -u

# scripts/lib/hosting-targets.mjs の回帰テスト。
#
# deploy.sh 本体は firebase CLI と実プロジェクトが無いと流せないため、
# 「どのターゲットに配るか」の判断だけを切り出して検証する。
#
# 検証するもの:
#   1. hosting 宣言が無ければ何も出さない（--only hosting のまま）
#   2. target / site 未設定の単一 hosting も何も出さない（テンプレート既定）
#   3. 環境名と同じターゲットがあれば、それ 1 つだけを出す（#323 の本体）
#   4. site での宣言でも環境名で絞り込む
#   5. 環境名と無関係なターゲット名なら従来どおり全部出し、警告する
#   6. 単一ターゲットは名前が環境名と違っても警告しない
#   7. DEPLOY_HOSTING_TARGETS があれば、それを優先する
#   8. DEPLOY_HOSTING_TARGETS に未宣言のターゲットがあれば止める
#   9. DEPLOY_HOSTING_TARGETS が空文字なら止める

cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/lib/hosting-targets.mjs"

passed=0
failed=0

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

WORK=$(mktemp -d) || exit 1

if [ -z "$WORK" ] || [ ! -d "$WORK" ]; then
  echo "作業ディレクトリを作れませんでした。" >&2
  exit 1
fi

trap 'rm -rf "$WORK"' EXIT

# $1: firebase.json の hosting の値（JSON）、$2: 環境名。
# 標準出力だけを返し、警告（標準エラー）と終了コードは別の変数に置く
run() {
  printf '{ "hosting": %s }\n' "$1" >"$WORK/firebase.json"

  RUN_STDERR=$(mktemp)
  RUN_OUT=$(node "$SCRIPT" "$2" "$WORK/firebase.json" 2>"$RUN_STDERR")
  RUN_STATUS=$?
  RUN_ERR=$(cat "$RUN_STDERR")
  rm -f "$RUN_STDERR"
}

# $1: 説明、$2: 期待する標準出力、$3: hosting の JSON、$4: 環境名
expect_targets() {
  run "$3" "$4"

  if [ "$RUN_STATUS" -ne 0 ]; then
    fail "$1（異常終了した）" "$RUN_ERR"
  elif [ "$RUN_OUT" = "$2" ]; then
    pass "$1"
  else
    fail "$1" "期待: '$2' / 実際: '$RUN_OUT'"
  fi
}

SINGLE='{ "source": "apps/web" }'
PER_ENV='[{ "target": "develop", "source": "apps/web" }, { "target": "staging", "source": "apps/web" }, { "target": "production", "source": "apps/web" }]'
PER_SITE='[{ "site": "develop", "source": "apps/web" }, { "site": "production", "source": "apps/web" }]'
PER_ROLE='[{ "target": "web", "source": "apps/web" }, { "target": "admin", "source": "apps/admin" }]'

echo "=== hosting-targets.mjs の回帰テスト ==="
echo ""

echo "[1] 絞り込みが要らない構成"
expect_targets "hosting 宣言が無ければ何も出さない" "" 'null' staging
expect_targets "target/site 未設定の単一 hosting は何も出さない" "" "$SINGLE" staging

echo ""
echo "[2] 環境ごとにサイトを分ける構成（#323）"
expect_targets "環境名と同じターゲットだけを出す" "staging" "$PER_ENV" staging
expect_targets "環境が変われば出る先も変わる" "production" "$PER_ENV" production
expect_targets "site での宣言でも絞り込む" "production" "$PER_SITE" production

run "$PER_ENV" staging
if printf '%s' "$RUN_OUT" | grep -q 'production'; then
  fail "staging のデプロイに production が混ざる（#323 の再発）" "$RUN_OUT"
else
  pass "staging のデプロイに production が混ざらない"
fi

echo ""
echo "[3] 環境名と無関係なターゲット名の構成"
expect_targets "絞り込めない構成では従来どおり全部出す" "web admin" "$PER_ROLE" staging

run "$PER_ROLE" staging
if printf '%s' "$RUN_ERR" | grep -q 'DEPLOY_HOSTING_TARGETS'; then
  pass "絞り込めなかったことを警告する"
else
  fail "絞り込めないまま黙って全部に配っている" "$RUN_ERR"
fi

run '[{ "target": "web", "source": "apps/web" }]' staging
if [ -z "$RUN_ERR" ]; then
  pass "単一ターゲットでは警告しない"
else
  fail "単一ターゲットで警告が出た" "$RUN_ERR"
fi

echo ""
echo "[4] DEPLOY_HOSTING_TARGETS での明示指定"
DEPLOY_HOSTING_TARGETS='develop staging'
export DEPLOY_HOSTING_TARGETS
expect_targets "明示指定が環境名より優先される" "develop staging" "$PER_ENV" production

DEPLOY_HOSTING_TARGETS='develop,staging'
expect_targets "カンマ区切りでも読む" "develop staging" "$PER_ENV" production

DEPLOY_HOSTING_TARGETS='nonexistent'
run "$PER_ENV" production
if [ "$RUN_STATUS" -ne 0 ] && printf '%s' "$RUN_ERR" | grep -q 'nonexistent'; then
  pass "未宣言のターゲットを指定したら止める"
else
  fail "未宣言のターゲットが素通りした" "status=$RUN_STATUS / $RUN_ERR"
fi

DEPLOY_HOSTING_TARGETS='   '
run "$PER_ENV" production
if [ "$RUN_STATUS" -ne 0 ]; then
  pass "空の DEPLOY_HOSTING_TARGETS で止める"
else
  fail "空の DEPLOY_HOSTING_TARGETS が素通りした（全ターゲットに配りうる）" "$RUN_OUT"
fi

unset DEPLOY_HOSTING_TARGETS

echo ""
echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 ==="

[ "$failed" -eq 0 ]

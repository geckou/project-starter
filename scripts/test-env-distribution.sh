#!/usr/bin/env bash
set -u

# scripts/use-env.sh が配る env ファイルの回帰テスト。
#
# 配布は「どのキーがどのファイルへ行くか」が全てで、間違えると
#   - 足りない: SSR や Functions で undefined になる（本番で初めて分かる）
#   - 多すぎる: 秘密が関数の環境変数として載り、閲覧者ロールから読める
# のどちらかになる。どちらも型チェックにもテストにも引っかからないため、ここで固定する。
#
# 検証するもの:
#   1. apps/web/.env が SSR で読むキーだけを持つ（framework-backed hosting 用）
#   2. apps/web/.env に秘密が載らない
#   3. apps/functions/.env が許可リストのキーだけを持つ
#   4. apps/functions/.env に秘密が載らない
#   5. 環境を切り替えると前の環境の値が残らない
#   6. .env.local は全文コピーされる（ローカル開発とビルドはこちらを読む）

cd "$(dirname "$0")/.."
REPO=$(pwd)

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

cp -R "$REPO/scripts" "$WORK/scripts"
mkdir -p "$WORK/apps/web" "$WORK/apps/functions" "$WORK/apps/mobile"

# use-env.sh の末尾は firebase use を呼ぶ。CLI もログインも無い環境で回すため
# スタブを PATH の先頭に置く
mkdir -p "$WORK/bin"
printf '#!/bin/sh\nexit 0\n' >"$WORK/bin/firebase"
chmod +x "$WORK/bin/firebase"

SECRET_VALUE='SHOULD_NOT_BE_DISTRIBUTED'

cat >"$WORK/.env.staging" <<ENVFILE
BASIC_AUTH_CREDENTIALS=user:staging-password
NEXT_PUBLIC_GTM_ID=GTM-STAGING
ALLOWED_ORIGINS=https://staging.example.com
FIREBASE_SERVICE_ACCOUNT_KEY=${SECRET_VALUE}
STRIPE_SECRET_KEY=${SECRET_VALUE}
ENVFILE

cat >"$WORK/.env.production" <<'ENVFILE'
NEXT_PUBLIC_GTM_ID=GTM-PRODUCTION
ALLOWED_ORIGINS=https://example.com
ENVFILE

run_use_env() {
  (cd "$WORK" && PATH="$WORK/bin:$PATH" bash scripts/use-env.sh "$1" >"$WORK/use-env.log" 2>&1)
}

echo "=== use-env.sh の配布内容 ==="
echo ""

echo "[1] apps/web/.env（framework-backed hosting の SSR 関数が読む）"

if ! run_use_env staging; then
  fail "use-env.sh staging が失敗した" "$(cat "$WORK/use-env.log")"
else
  pass "use-env.sh staging が通る"
fi

if [ -f "$WORK/apps/web/.env" ]; then
  pass "apps/web/.env が生成される"
else
  fail "apps/web/.env が生成されない（SSR でサーバー専用の値が undefined になる）" \
    "$(cat "$WORK/use-env.log")"
fi

if grep -qx 'BASIC_AUTH_CREDENTIALS=user:staging-password' "$WORK/apps/web/.env" 2>/dev/null; then
  pass "SSR で読むキーが載る（BASIC_AUTH_CREDENTIALS）"
else
  fail "BASIC_AUTH_CREDENTIALS が apps/web/.env に無い（dev/stg の Basic 認証が効かない）" \
    "$(cat "$WORK/apps/web/.env" 2>&1)"
fi

if grep -q "$SECRET_VALUE" "$WORK/apps/web/.env" 2>/dev/null; then
  fail "apps/web/.env に秘密が載っている（関数の環境変数は閲覧者ロールから読める）" \
    "$(grep -n "$SECRET_VALUE" "$WORK/apps/web/.env")"
else
  pass "apps/web/.env に秘密が載らない"
fi

# NEXT_PUBLIC_* は next build がローカルで埋め込むので、関数の環境変数には要らない
if grep -q '^NEXT_PUBLIC_' "$WORK/apps/web/.env" 2>/dev/null; then
  fail "apps/web/.env に NEXT_PUBLIC_* が載っている（ビルド時に埋め込まれるので不要）" \
    "$(grep -n '^NEXT_PUBLIC_' "$WORK/apps/web/.env")"
else
  pass "apps/web/.env に NEXT_PUBLIC_* を載せない"
fi

echo ""
echo "[2] apps/functions/.env（Functions が読む）"

if grep -qx 'ALLOWED_ORIGINS=https://staging.example.com' "$WORK/apps/functions/.env" 2>/dev/null; then
  pass "許可リストのキーが載る（ALLOWED_ORIGINS）"
else
  fail "ALLOWED_ORIGINS が apps/functions/.env に無い" \
    "$(cat "$WORK/apps/functions/.env" 2>&1)"
fi

if grep -q "$SECRET_VALUE" "$WORK/apps/functions/.env" 2>/dev/null; then
  fail "apps/functions/.env に秘密が載っている" \
    "$(grep -n "$SECRET_VALUE" "$WORK/apps/functions/.env")"
else
  pass "apps/functions/.env に秘密が載らない"
fi

echo ""
echo "[3] .env.local は全文コピー（ローカル開発と next build が読む）"

if grep -q "$SECRET_VALUE" "$WORK/apps/web/.env.local" 2>/dev/null; then
  pass "apps/web/.env.local は全文（サーバー専用の値も含む）"
else
  fail "apps/web/.env.local が全文になっていない" "$(cat "$WORK/apps/web/.env.local" 2>&1)"
fi

echo ""
echo "[4] 環境の切り替え"

if ! run_use_env production; then
  fail "use-env.sh production が失敗した" "$(cat "$WORK/use-env.log")"
else
  pass "use-env.sh production が通る"
fi

if grep -q 'staging-password' "$WORK/apps/web/.env" 2>/dev/null; then
  fail "apps/web/.env に前の環境の値が残っている（別環境の設定で SSR が動く）" \
    "$(cat "$WORK/apps/web/.env")"
else
  pass "apps/web/.env に前の環境の値が残らない"
fi

if grep -q 'staging.example.com' "$WORK/apps/functions/.env" 2>/dev/null; then
  fail "apps/functions/.env に前の環境の値が残っている" \
    "$(cat "$WORK/apps/functions/.env")"
else
  pass "apps/functions/.env に前の環境の値が残らない"
fi

echo ""
echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 ==="

[ "$failed" -eq 0 ]

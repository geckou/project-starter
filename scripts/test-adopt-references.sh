#!/usr/bin/env bash
set -u

# scripts/adopt-references.mjs の回帰テスト。
#
# 検証するもの:
#   1. 古い派生（push トリガーの ci.yml、.templatesyncignore 無し、
#      .prettierignore に生成ファイルの除外なし）が推奨形になること
#   2. mobile の有無で renovate.json5 / .prettierignore の中身が分かれること
#   3. 2 回流しても差分が出ないこと（冪等）
#   4. --dry-run がファイルを書かないこと
#   5. 妥当でない対象（git でない・package.json が無い・テンプレート自身）を拒むこと
#
# node_modules に依存しないので yarn install なしで実行できる
# （実体を package.json ではなくここに置く理由は scripts/test-layers.sh と同じ）。

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)
SCRIPT="$REPO_ROOT/scripts/adopt-references.mjs"

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

# 移行前の「古い派生プロジェクト」を作る。$1 に mobile を渡すと apps/mobile を持つ
make_derived() {
  local dir
  dir=$(mktemp -d)

  mkdir -p "$dir/.github/workflows" "$dir/apps/web"
  printf '{ "name": "derived", "private": true }\n' > "$dir/package.json"

  # 古い ci.yml。production への push を含むため deploy と二重に走る
  cat > "$dir/.github/workflows/ci.yml" <<'YAML'
name: CI

on:
  push:
    branches: [production]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn lint
YAML

  # 生成ファイルの除外が無い .prettierignore
  printf 'node_modules\n.next\n' > "$dir/.prettierignore"

  if [ "${1:-}" = "mobile" ]; then
    mkdir -p "$dir/apps/mobile"
  fi

  git -C "$dir" init --quiet
  printf '%s' "$dir"
}

adopt() {
  local dir=$1
  shift
  node "$SCRIPT" --repo "$dir" "$@" 2>&1
}

tree_checksum() {
  find "$1" -type f -not -path '*/.git/*' -exec sha1sum {} + |
    sed "s|$1||" | sort | sha1sum
}

echo "=== adopt-references.mjs の回帰テスト ==="
echo ""

echo "[1] mobile あり（古い派生からの移行）"
derived=$(make_derived mobile)
output=$(adopt "$derived")

if grep -q 'uses: geckou/project-starter/.github/workflows/ci.yml@v1' "$derived/.github/workflows/ci.yml"; then
  pass "ci.yml が reusable workflow の参照になる"
else
  fail "ci.yml が参照になっていない" "$output"
fi

if grep -qE '^\s*push:' "$derived/.github/workflows/ci.yml"; then
  fail "古い push トリガーが引き継がれた（CI と deploy が二重実行になる）"
else
  pass "古い push トリガーを引き継がない"
fi

if grep -q '^\.github/workflows/ci\.yml$' "$derived/.templatesyncignore"; then
  pass ".templatesyncignore に ci.yml が追加される"
else
  fail ".templatesyncignore に ci.yml が無い" "$output"
fi

if grep -q 'renovate/default' "$derived/renovate.json5"; then
  pass "renovate.json5 が default preset を extends する"
else
  fail "renovate.json5 が生成されていない" "$output"
fi

if grep -q 'renovate/mobile' "$derived/renovate.json5"; then
  pass "mobile ありでは //renovate/mobile も extends する"
else
  fail "mobile ありなのに //renovate/mobile が無い"
fi

if grep -q '^apps/mobile/expo-env\.d\.ts$' "$derived/.prettierignore"; then
  pass ".prettierignore に生成ファイルの除外が足される"
else
  fail ".prettierignore に expo-env.d.ts の除外が無い" "$output"
fi

if grep -q '^node_modules$' "$derived/.prettierignore"; then
  pass "既存の .prettierignore の内容を残す"
else
  fail "既存の .prettierignore の内容が消えた"
fi

if printf '%s' "$output" | grep -q 'Silent mode'; then
  pass "手動作業のチェックリストを印字する"
else
  fail "手動作業が印字されない" "$output"
fi

# 冪等性
before=$(tree_checksum "$derived")
second=$(adopt "$derived")
after=$(tree_checksum "$derived")

if [ "$before" = "$after" ]; then
  pass "2 回流しても差分が出ない（冪等）"
else
  fail "2 回目の実行でファイルが変わった" "$second"
fi

if printf '%s' "$second" | grep -q '変更はありません'; then
  pass "適用済みなら変更なしと報告する"
else
  fail "適用済みでも変更を報告した" "$second"
fi

rm -rf "$derived"
echo ""

echo "[2] mobile なし"
derived=$(make_derived)
output=$(adopt "$derived")

if grep -q 'renovate/mobile' "$derived/renovate.json5"; then
  fail "mobile が無いのに //renovate/mobile を extends している"
else
  pass "mobile なしでは //renovate/mobile を入れない"
fi

if grep -q 'layer:mobile' "$derived/renovate.json5"; then
  fail "mobile のマーカーが残っている"
else
  pass "mobile のマーカーが残らない"
fi

# 1 要素の配列を展開したまま置くと、派生側の prettier --check が畳もうとして落ちる
if grep -q "^  extends: \['github>geckou/project-starter//renovate/default'\],$" "$derived/renovate.json5"; then
  pass "1 要素になった extends を Prettier と同じ形（1 行）で書く"
else
  fail "extends が Prettier の整形結果と違う形になっている" "$(cat "$derived/renovate.json5")"
fi

if grep -q 'expo-env\.d\.ts' "$derived/.prettierignore"; then
  fail "mobile が無いのに mobile 向けの除外を足した"
else
  pass "mobile なしでは mobile 向けの除外を足さない"
fi

rm -rf "$derived"
echo ""

echo "[3] --dry-run"
derived=$(make_derived mobile)
before=$(tree_checksum "$derived")
output=$(adopt "$derived" --dry-run)
after=$(tree_checksum "$derived")

if [ "$before" = "$after" ]; then
  pass "--dry-run はファイルを変更しない"
else
  fail "--dry-run でファイルが変更された" "$output"
fi

if printf '%s' "$output" | grep -q 'dry-run'; then
  pass "--dry-run が変更予定を印字する"
else
  fail "--dry-run で変更予定が印字されない" "$output"
fi

rm -rf "$derived"
echo ""

echo "[4] 対象の妥当性検査"
not_git=$(mktemp -d)
printf '{}\n' > "$not_git/package.json"

if adopt "$not_git" > /dev/null 2>&1; then
  fail "git リポジトリでない対象がエラーにならない"
else
  pass "git リポジトリでない対象はエラーになる"
fi

rm -rf "$not_git"

no_package=$(mktemp -d)
git -C "$no_package" init --quiet

if adopt "$no_package" > /dev/null 2>&1; then
  fail "package.json の無い対象がエラーにならない"
else
  pass "package.json の無い対象はエラーになる"
fi

rm -rf "$no_package"

if adopt "$REPO_ROOT" > /dev/null 2>&1; then
  fail "テンプレート自身がエラーにならない（reusable workflow を潰す）"
else
  pass "テンプレート自身はエラーになる"
fi

if node "$SCRIPT" > /dev/null 2>&1; then
  fail "--repo なしがエラーにならない"
else
  pass "--repo なしはエラーになる"
fi

echo ""
echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 ==="

if [ "$failed" -gt 0 ]; then
  exit 1
fi

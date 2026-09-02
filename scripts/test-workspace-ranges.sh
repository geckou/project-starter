#!/usr/bin/env bash
set -u

# scripts/check-workspace-ranges.mjs の回帰テスト。
#
# 検証するもの:
#   1. レンジを満たしていれば通す
#   2. minor を上げてレンジ外になったら止めて、上げ先を示す
#   3. major を上げてレンジ外になったら止める
#   4. 0 系の ^ は minor を固定する（^0.2.0 は 0.3.0 を満たさない）
#   5. ~ は minor を固定する
#   6. "*" と workspace: は常に通す
#   7. 外部パッケージ（ローカルに無い名前）は見ない
#   8. 判定できないレンジ（複合レンジ・git 参照）は警告して素通しする
#   9. dependencies 以外のフィールドも見る

cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/check-workspace-ranges.mjs"

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

# 検査対象のリポジトリを組み立てる。$1 に packages/lib の version、
# $2 に apps/app が持つレンジ、$3 にフィールド名（既定は devDependencies）
make_repo() {
  local version=$1
  local range=$2
  local field=${3:-devDependencies}
  local dep_name=${4:-@geckou/lib}

  rm -rf "$WORK/repo"
  mkdir -p "$WORK/repo/scripts" "$WORK/repo/packages/lib" "$WORK/repo/apps/app"
  cp "$SCRIPT" "$WORK/repo/scripts/check-workspace-ranges.mjs"

  cat > "$WORK/repo/packages/lib/package.json" <<JSON
{ "name": "@geckou/lib", "version": "$version" }
JSON

  cat > "$WORK/repo/apps/app/package.json" <<JSON
{ "name": "@geckou/app", "version": "1.0.0", "$field": { "$dep_name": "$range" } }
JSON
}

run() {
  (cd "$WORK/repo" && node scripts/check-workspace-ranges.mjs 2>&1)
}

echo "1. レンジを満たしていれば通す"

make_repo 0.2.1 '^0.2.0'
output=$(run)

if [ $? -eq 0 ] && echo "$output" | grep -q '\[ok\]'; then
  pass "満たしていれば通る"
else
  fail "満たしていれば通る" "$output"
fi

echo "2. minor 上げでレンジ外になったら止める"

make_repo 0.3.0 '^0.2.0'
output=$(run)
status=$?

if [ "$status" -ne 0 ] && echo "$output" | grep -q '"\^0.2.0" → "\^0.3.0"'; then
  pass "止まって上げ先を示す"
else
  fail "止まって上げ先を示す" "$output"
fi

echo "3. major 上げでレンジ外になったら止める"

make_repo 2.0.0 '^1.2.0'
output=$(run)
status=$?

if [ "$status" -ne 0 ]; then
  pass "major でも止まる"
else
  fail "major でも止まる" "$output"
fi

echo "4. 0 系の ^ は minor を固定する"

make_repo 0.2.0 '^0.1.0'
output=$(run)
status=$?

if [ "$status" -ne 0 ]; then
  pass "^0.1.0 は 0.2.0 を満たさない"
else
  fail "^0.1.0 は 0.2.0 を満たさない" "$output"
fi

make_repo 1.3.0 '^1.2.0'
output=$(run)

if [ $? -eq 0 ]; then
  pass "^1.2.0 は 1.3.0 を満たす"
else
  fail "^1.2.0 は 1.3.0 を満たす" "$output"
fi

echo "5. ~ は minor を固定する"

make_repo 1.3.0 '~1.2.0'
output=$(run)
status=$?

if [ "$status" -ne 0 ]; then
  pass "~1.2.0 は 1.3.0 を満たさない"
else
  fail "~1.2.0 は 1.3.0 を満たさない" "$output"
fi

echo "6. \"*\" と workspace: は常に通す"

for range in '*' 'workspace:^'; do
  make_repo 9.9.9 "$range"
  output=$(run)

  if [ $? -eq 0 ]; then
    pass "[$range] は通る"
  else
    fail "[$range] は通る" "$output"
  fi
done

echo "7. 外部パッケージは見ない"

make_repo 0.3.0 '^0.1.0' devDependencies 'eslint'
output=$(run)

if [ $? -eq 0 ]; then
  pass "ローカルに無い名前は無視する"
else
  fail "ローカルに無い名前は無視する" "$output"
fi

echo "8. 判定できないレンジは警告して素通しする"

for range in 'github:geckou/lib#main' '>=1.2.0 <2.0.0' '^1.0.0 || ^2.0.0'; do
  make_repo 9.9.9 "$range"
  output=$(run)
  status=$?

  if [ "$status" -eq 0 ] && echo "$output" | grep -q '\[warn\]'; then
    pass "警告して通す: [$range]"
  else
    fail "警告して通す: [$range]" "$output"
  fi
done

echo "9. dependencies 以外も見る"

make_repo 0.3.0 '^0.2.0' dependencies
output=$(run)
status=$?

if [ "$status" -ne 0 ]; then
  pass "dependencies も検査する"
else
  fail "dependencies も検査する" "$output"
fi

make_repo 0.3.0 '^0.2.0' peerDependencies
output=$(run)
status=$?

if [ "$status" -ne 0 ]; then
  pass "peerDependencies も検査する"
else
  fail "peerDependencies も検査する" "$output"
fi

echo ""
echo "成功 $passed / 失敗 $failed"

[ "$failed" -eq 0 ]

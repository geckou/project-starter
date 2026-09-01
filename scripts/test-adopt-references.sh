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
#   6. 第0層の設定（#132）が参照形になること。ワークスペース種別ごとの ESLint プリセット、
#      .prettierrc の削除と tailwindStylesheet の引き継ぎ、依存の入れ替え
#   7. 生成物がテンプレート側の実体と一致すること（片方だけ直したときに気付けるように）
#   8. 独自ルールを持つ設定ファイルを上書きしないこと（--force のときだけ上書きする）
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

# 第0層の設定（#132）が参照方式になっていない派生を作る。
# $1 に mobile を渡すと apps/mobile を持つ
make_config_derived() {
  local dir
  dir=$(mktemp -d)

  mkdir -p "$dir/apps/web" "$dir/apps/functions" "$dir/packages/shared"

  cat > "$dir/package.json" <<'JSON'
{
  "name": "derived",
  "private": true,
  "devDependencies": {
    "@commitlint/cli": "^21",
    "@commitlint/config-conventional": "^21",
    "prettier": "^3.9.6",
    "prettier-plugin-tailwindcss": "^0.8.1"
  }
}
JSON

  # Next.js アプリ（eslint.config.mjs をまだ持たない構成）
  cat > "$dir/apps/web/package.json" <<'JSON'
{
  "name": "web",
  "dependencies": { "next": "^15.5.23" },
  "devDependencies": {
    "@eslint/eslintrc": "^3.0.0",
    "eslint": "^9.39.5",
    "eslint-config-next": "^15.5.23",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-import": "^2.31.0"
  }
}
JSON

  # TypeScript パッケージ（移行前の形の eslint.config.mjs を持つ）
  cat > "$dir/apps/functions/package.json" <<'JSON'
{
  "name": "functions",
  "devDependencies": {
    "eslint": "^9.39.5",
    "typescript-eslint": "^8.67.0"
  }
}
JSON
  cat > "$dir/apps/functions/eslint.config.mjs" <<'MJS'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'eslint.config.mjs'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // フォーマット系ルールは Prettier に委譲
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      // 理由コメント付きの ts-ignore / ts-nocheck は許可
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
        },
      ],
    },
  }
)
MJS

  # eslint.config.mjs も ESLint への依存も持たないワークスペース（対象外）
  printf '{ "name": "shared" }\n' > "$dir/packages/shared/package.json"

  # ESLint は使っているが eslint.config.mjs をまだ持たないワークスペース
  mkdir -p "$dir/packages/core"
  cat > "$dir/packages/core/package.json" <<'JSON'
{
  "name": "core",
  "devDependencies": {
    "eslint": "^9.39.5",
    "typescript-eslint": "^8.67.0"
  }
}
JSON

  # 移行前の .prettierrc（Prettier が .prettierrc.cjs より先に読む）
  cat > "$dir/.prettierrc" <<'JSON'
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./apps/web/src/styles/globals.css"
}
JSON

  printf 'node_modules\n' > "$dir/.prettierignore"

  if [ "${1:-}" = "mobile" ]; then
    mkdir -p "$dir/apps/mobile"
    cat > "$dir/apps/mobile/package.json" <<'JSON'
{
  "name": "mobile",
  "dependencies": { "expo": "~52.0.0" },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.39.5",
    "eslint-config-expo": "~8.0.0"
  }
}
JSON
  fi

  git -C "$dir" init --quiet
  printf '%s' "$dir"
}

has_dependency() {
  node -e '
    const manifest = require(process.argv[1])
    const all = { ...manifest.dependencies, ...manifest.devDependencies }
    process.exit(all[process.argv[2]] === undefined ? 1 : 0)
  ' "$1" "$2"
}

echo "[5] 第0層の設定を参照形にする（mobile あり）"
derived=$(make_config_derived mobile)
output=$(adopt "$derived")

if grep -q "@geckou/eslint-config/next" "$derived/apps/web/eslint.config.mjs"; then
  pass "Next.js アプリには ./next のプリセットを生成する"
else
  fail "apps/web の eslint.config.mjs が ./next になっていない" "$output"
fi

if grep -q "@geckou/eslint-config/expo" "$derived/apps/mobile/eslint.config.mjs"; then
  pass "Expo アプリには ./expo のプリセットを生成する"
else
  fail "apps/mobile の eslint.config.mjs が ./expo になっていない" "$output"
fi

if grep -q "^import geckou from '@geckou/eslint-config'$" "$derived/apps/functions/eslint.config.mjs"; then
  pass 'TypeScript パッケージには「.」のプリセットを生成する（移行前の形を置き換える）'
else
  fail "apps/functions の eslint.config.mjs が置き換わっていない" "$output"
fi

if [ -f "$derived/packages/shared/eslint.config.mjs" ]; then
  fail "ESLint を使っていないワークスペースに eslint.config.mjs を作った"
else
  pass "ESLint を使っていないワークスペースは対象にしない"
fi

# 判定は依存で行う。設定ファイルの有無だけで見ると、これから作る構成を取りこぼす
if grep -q "^import geckou from '@geckou/eslint-config'$" "$derived/packages/core/eslint.config.mjs" 2> /dev/null; then
  pass "ESLint に依存していれば eslint.config.mjs が無くても生成する"
else
  fail "eslint.config.mjs を持たない TS ワークスペースが対象外になった" "$output"
fi

# テンプレート側の実体との一致（生成物が古くなっていないこと）
for pair in "apps/web:apps/web" "apps/mobile:apps/mobile" "apps/functions:packages/shared"; do
  target=${pair%%:*}
  template=${pair##*:}

  if diff -q "$derived/$target/eslint.config.mjs" \
    "$REPO_ROOT/$template/eslint.config.mjs" > /dev/null; then
    pass "$target/eslint.config.mjs がテンプレートの実体と一致する"
  else
    fail "$target/eslint.config.mjs がテンプレートの実体と違う" \
      "$(diff "$derived/$target/eslint.config.mjs" "$REPO_ROOT/$template/eslint.config.mjs")"
  fi
done

if [ -f "$derived/.prettierrc" ]; then
  fail "古い .prettierrc が残っている（.prettierrc.cjs より先に読まれる）"
else
  pass "古い .prettierrc を削除する"
fi

if grep -q "tailwindStylesheet: './apps/web/src/styles/globals.css'" "$derived/.prettierrc.cjs"; then
  pass ".prettierrc.cjs が tailwindStylesheet の値を引き継ぐ"
else
  fail "tailwindStylesheet が引き継がれていない" "$(cat "$derived/.prettierrc.cjs")"
fi

if diff -q "$derived/.prettierrc.cjs" "$REPO_ROOT/.prettierrc.cjs" > /dev/null; then
  pass ".prettierrc.cjs がテンプレートの実体と一致する"
else
  fail ".prettierrc.cjs がテンプレートの実体と違う" \
    "$(diff "$derived/.prettierrc.cjs" "$REPO_ROOT/.prettierrc.cjs")"
fi

if diff -q "$derived/commitlint.config.cjs" "$REPO_ROOT/commitlint.config.cjs" > /dev/null; then
  pass "commitlint.config.cjs がテンプレートの実体と一致する"
else
  fail "commitlint.config.cjs がテンプレートの実体と違う" \
    "$(diff "$derived/commitlint.config.cjs" "$REPO_ROOT/commitlint.config.cjs")"
fi

if has_dependency "$derived/package.json" "@geckou/prettier-config" &&
  has_dependency "$derived/package.json" "@geckou/commitlint-config"; then
  pass "ルートの package.json に設定パッケージを追加する"
else
  fail "ルートに @geckou/*-config が追加されていない" "$(cat "$derived/package.json")"
fi

if has_dependency "$derived/package.json" "prettier-plugin-tailwindcss" ||
  has_dependency "$derived/package.json" "@commitlint/config-conventional"; then
  fail "実体だった依存がルートに残っている" "$(cat "$derived/package.json")"
else
  pass "実体だった依存をルートから削除する"
fi

if has_dependency "$derived/apps/web/package.json" "@geckou/eslint-config"; then
  pass "各ワークスペースに @geckou/eslint-config を追加する"
else
  fail "apps/web に @geckou/eslint-config が無い" "$(cat "$derived/apps/web/package.json")"
fi

if has_dependency "$derived/apps/web/package.json" "eslint-config-next" ||
  has_dependency "$derived/apps/web/package.json" "@eslint/eslintrc"; then
  fail "実体だった ESLint の依存が残っている" "$(cat "$derived/apps/web/package.json")"
else
  pass "実体だった ESLint の依存を削除する"
fi

if has_dependency "$derived/apps/mobile/package.json" "@typescript-eslint/parser"; then
  fail "@typescript-eslint/* が残っている" "$(cat "$derived/apps/mobile/package.json")"
else
  pass "@typescript-eslint/* も削除する"
fi

if has_dependency "$derived/apps/web/package.json" "eslint"; then
  pass "eslint 本体は残す（プリセットの peerDependency）"
else
  fail "eslint 本体まで削除した" "$(cat "$derived/apps/web/package.json")"
fi

if printf '%s' "$output" | grep -q 'yarn install'; then
  pass "依存を入れ替えたら yarn install を残作業に出す"
else
  fail "yarn install が残作業に出ない" "$output"
fi

before=$(tree_checksum "$derived")
second=$(adopt "$derived")
after=$(tree_checksum "$derived")

if [ "$before" = "$after" ]; then
  pass "2 回流しても差分が出ない（冪等）"
else
  fail "2 回目の実行でファイルが変わった" "$second"
fi

rm -rf "$derived"
echo ""

echo "[6] 第0層の設定（mobile なし・--dry-run）"
derived=$(make_config_derived)
before=$(tree_checksum "$derived")
output=$(adopt "$derived" --dry-run)
after=$(tree_checksum "$derived")

if [ "$before" = "$after" ]; then
  pass "--dry-run は設定ファイルを書かない"
else
  fail "--dry-run で設定ファイルが変わった" "$output"
fi

# キーの順序だけが違う .prettierrc も「テンプレートの既知の形」として扱う
cat > "$derived/.prettierrc" <<'JSON'
{
  "printWidth": 80,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"],
  "singleQuote": true,
  "semi": false,
  "trailingComma": "es5"
}
JSON
output=$(adopt "$derived")

if [ ! -f "$derived/.prettierrc" ] && [ -f "$derived/.prettierrc.cjs" ]; then
  pass "キーの順序が違う .prettierrc も移行する"
else
  fail "キーの順序の違いで独自設定と誤判定した" "$output"
fi

if grep -rq "@geckou/eslint-config/expo" "$derived/apps"; then
  fail "mobile が無いのに ./expo のプリセットを生成した" "$output"
else
  pass "mobile なしでは ./expo のプリセットを生成しない"
fi

if grep -q "@geckou/eslint-config/next" "$derived/apps/web/eslint.config.mjs"; then
  pass "mobile なしでも Next.js アプリは ./next になる"
else
  fail "mobile なしで apps/web のプリセットが違う" "$output"
fi

rm -rf "$derived"
echo ""

echo "[7] 独自ルールを持つ設定は上書きしない"
derived=$(make_config_derived)
cat > "$derived/apps/functions/eslint.config.mjs" <<'MJS'
import tseslint from 'typescript-eslint'

export default tseslint.config(...tseslint.configs.recommended, {
  rules: { 'no-console': 'error' },
})
MJS
printf '{ "semi": true, "printWidth": 120 }\n' > "$derived/.prettierrc"
output=$(adopt "$derived")

if grep -q "no-console" "$derived/apps/functions/eslint.config.mjs"; then
  pass "独自ルールを持つ eslint.config.mjs を上書きしない"
else
  fail "独自ルールを持つ eslint.config.mjs を上書きした" "$output"
fi

if [ -f "$derived/.prettierrc" ] && [ ! -f "$derived/.prettierrc.cjs" ]; then
  pass "独自の .prettierrc は消さず、.prettierrc.cjs も作らない"
else
  fail "独自の .prettierrc を消した（設定が失われる）" "$output"
fi

if printf '%s' "$output" | grep -q -- '--force'; then
  pass "手を入れなかったファイルを差分つきで印字する"
else
  fail "手を入れなかったファイルが印字されない" "$output"
fi

# 設定を残したまま実体を消すと、その設定が壊れる（lint / format が落ちる）
if has_dependency "$derived/apps/functions/package.json" "typescript-eslint"; then
  pass "手つかずの eslint.config.mjs が必要とする依存を残す"
else
  fail "独自設定を残したまま ESLint の実体を消した" "$(cat "$derived/apps/functions/package.json")"
fi

if has_dependency "$derived/package.json" "prettier-plugin-tailwindcss"; then
  pass "手つかずの .prettierrc が必要とする依存を残す"
else
  fail "独自の .prettierrc を残したまま Prettier の実体を消した" "$(cat "$derived/package.json")"
fi

if has_dependency "$derived/package.json" "@geckou/prettier-config"; then
  fail "手つかずの .prettierrc があるのに参照だけ足した" "$(cat "$derived/package.json")"
else
  pass "手つかずのツールには参照も足さない"
fi

if has_dependency "$derived/package.json" "@geckou/commitlint-config"; then
  pass "手つかずでないツール（commitlint）の入れ替えは行う"
else
  fail "commitlint の入れ替えまで止めた" "$(cat "$derived/package.json")"
fi

if has_dependency "$derived/apps/web/package.json" "eslint-config-next"; then
  fail "別のワークスペースの手つかずに巻き込まれて入れ替えが止まった" \
    "$(cat "$derived/apps/web/package.json")"
else
  pass "手つかずでないワークスペースの入れ替えは行う"
fi

output=$(adopt "$derived" --force)

if grep -q "@geckou/eslint-config" "$derived/apps/functions/eslint.config.mjs" &&
  [ ! -f "$derived/.prettierrc" ]; then
  pass "--force なら上書きする"
else
  fail "--force でも上書きされない" "$output"
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

# テンプレートの別クローンも対象にできない（origin で判定する）
template_clone=$(make_derived)
git -C "$template_clone" remote add origin https://github.com/geckou/project-starter.git

if adopt "$template_clone" > /dev/null 2>&1; then
  fail "テンプレートの別クローンがエラーにならない"
else
  pass "テンプレートの別クローン（origin で判定）はエラーになる"
fi

rm -rf "$template_clone"

# 逆に、Template Sync で renovate/ や reusable workflow の実体を受け取っている
# 派生プロジェクトは正当な対象。ファイルの有無で拒むと移行できなくなる
derived=$(make_derived)
mkdir -p "$derived/renovate"
printf '{}\n' > "$derived/renovate/default.json"
git -C "$derived" remote add origin https://github.com/geckou/some-derived-project.git

if adopt "$derived" > /dev/null 2>&1; then
  pass "renovate/ を持つ派生（Template Sync 済み）は拒まれない"
else
  fail "renovate/ を持つ派生を誤って拒んだ" "$(adopt "$derived" 2>&1)"
fi

rm -rf "$derived"

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

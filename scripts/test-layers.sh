#!/usr/bin/env bash
set -u

# 層マニフェスト（layers.json）と減算スクリプトの回帰テスト。
#
# 検証するもの:
#   1. check-layers.mjs が実態との不一致を検出できること（壊して確かめる）
#   2. remove-layer.mjs が層ごとに正しく減算すること（ファイル・依存・設定・マーカー）
#   3. 減算後も残ったファイルが構文として壊れていないこと
#   4. 減算後のリポジトリに、外した層への参照が残っていないこと
#
# 実体を package.json ではなくこのスクリプトに置いている理由は
# scripts/test-hooks.sh と同じ（ルート package.json は Template Sync の対象外）。
# node_modules に依存しないので yarn install なしで実行できる。

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

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

# リポジトリの作業ツリーを一時ディレクトリに複製する。
# git 管理下のファイル（+ 未追跡だが gitignore されていないファイル）だけを写すことで、
# node_modules・dist・.next 等のビルド成果物が混ざらないようにする
make_variant() {
  local dir
  dir=$(mktemp -d)
  (cd "$REPO_ROOT" && git ls-files -z --cached --others --exclude-standard) |
    tar -cf - -C "$REPO_ROOT" --null -T - |
    tar -xf - -C "$dir"
  printf '%s' "$dir"
}

remove_layers() {
  local dir=$1
  shift
  node "$REPO_ROOT/scripts/remove-layer.mjs" --target "$dir" "$@" 2>&1
}

json_has() {
  # json_has <ファイル> <JS 式（json 変数を参照）> — 真なら 0
  node -e "
    const json = require('$1');
    process.exit(($2) ? 0 : 1);
  " 2>/dev/null
}

echo "=== 層マニフェストの回帰テスト ==="
echo ""

# --- 1. マニフェスト自体の検証 ---
echo "[1] check-layers.mjs"

if node scripts/check-layers.mjs > /dev/null 2>&1; then
  pass "現在のリポジトリはマニフェストと一致している"
else
  fail "check-layers.mjs が失敗した" "$(node scripts/check-layers.mjs 2>&1)"
fi

# files の実在チェックが効くか（存在しないパスを足して壊す）
broken=$(make_variant)
node -e "
  const fs = require('fs');
  const manifest = JSON.parse(fs.readFileSync('$broken/layers.json', 'utf8'));
  manifest.layers.find((l) => l.name === 'firebase').files.push('apps/web/src/lib/does-not-exist.ts');
  fs.writeFileSync('$broken/layers.json', JSON.stringify(manifest, null, 2) + '\n');
"
if (cd "$broken" && node scripts/check-layers.mjs > /dev/null 2>&1); then
  fail "存在しない files を検出できていない"
else
  pass "存在しない files を検出する"
fi
rm -rf "$broken"

# 未登録のマーカーを検出できるか
broken=$(make_variant)
printf '\n// layer:firebase:start\n// layer:firebase:end\n' >> "$broken/apps/web/src/app/page.tsx"
if (cd "$broken" && node scripts/check-layers.mjs > /dev/null 2>&1); then
  fail "blocks に未登録のマーカーを検出できていない"
else
  pass "blocks に未登録のマーカーを検出する"
fi
rm -rf "$broken"

# 閉じていないマーカーを検出できるか
broken=$(make_variant)
printf '\n// layer:billing:start\n' >> "$broken/packages/shared/src/index.ts"
if (cd "$broken" && node scripts/check-layers.mjs > /dev/null 2>&1); then
  fail "閉じていないマーカーを検出できていない"
else
  pass "閉じていないマーカーを検出する"
fi
rm -rf "$broken"

echo ""

# --- 2. billing だけを外す ---
echo "[2] remove-layer.mjs billing"

variant=$(make_variant)
output=$(remove_layers "$variant" billing)

if [ ! -e "$variant/apps/functions/src/lib/billing.ts" ] &&
  [ ! -e "$variant/apps/web/src/app/billing" ] &&
  [ ! -e "$variant/packages/shared/src/billing" ] &&
  [ ! -e "$variant/apps/mobile/src/lib/revenuecat.ts" ]; then
  pass "課金のファイルが消える"
else
  fail "課金のファイルが残っている" "$output"
fi

if [ -d "$variant/apps/functions" ] && [ -d "$variant/apps/mobile" ]; then
  pass "functions / mobile は残る（billing は葉の層）"
else
  fail "billing の削除で他の層まで消えた"
fi

if json_has "$variant/apps/functions/package.json" "!json.dependencies.stripe && !json.dependencies['@geckou/billing']"; then
  pass "functions から stripe / @geckou/billing が消える"
else
  fail "functions の課金依存が残っている"
fi

if json_has "$variant/apps/functions/package.json" "!json.scripts.build.includes('--external:stripe')"; then
  pass "esbuild の --external:stripe が消える"
else
  fail "--external:stripe が残っている"
fi

if json_has "$variant/packages/shared/package.json" "!json.exports['./billing']"; then
  pass "shared の ./billing サブパスが消える"
else
  fail "shared の ./billing が残っている"
fi

if ! grep -q "getBilling\|billingHandler\|/webhooks/stripe" "$variant/apps/functions/src/api.ts"; then
  pass "api.ts から課金ルートが消える"
else
  fail "api.ts に課金ルートが残っている"
fi

if grep -q "'/health'" "$variant/apps/functions/src/api.ts" && grep -q "requireAuth" "$variant/apps/functions/src/api.ts"; then
  pass "api.ts の課金以外のルートは残る"
else
  fail "api.ts の課金以外のルートまで消えた"
fi

if ! grep -q "STRIPE_SECRET_KEY\|REVENUECAT_API_KEY_APPLE" "$variant/.env.example"; then
  pass ".env.example から課金の env が消える"
else
  fail ".env.example に課金の env が残っている"
fi

if grep -q "ALLOWED_ORIGINS" "$variant/.env.example"; then
  pass ".env.example の functions の env は残る"
else
  fail ".env.example から functions の env まで消えた"
fi

if bash -n "$variant/scripts/use-env.sh" 2>/dev/null && node --check "$variant/lint-staged.config.cjs" 2>/dev/null; then
  pass "残ったスクリプトの構文が壊れていない"
else
  fail "スクリプトの構文が壊れた"
fi

if (cd "$variant" && node scripts/check-layers.mjs > /dev/null 2>&1); then
  pass "減算後の構成でも check-layers.mjs が通る"
else
  fail "減算後の構成で check-layers.mjs が落ちる" "$(cd "$variant" && node scripts/check-layers.mjs 2>&1)"
fi

rm -rf "$variant"
echo ""

# --- 3. mobile を外す ---
echo "[3] remove-layer.mjs mobile"

variant=$(make_variant)
output=$(remove_layers "$variant" mobile)

if [ ! -e "$variant/apps/mobile" ]; then
  pass "apps/mobile が消える"
else
  fail "apps/mobile が残っている" "$output"
fi

if json_has "$variant/package.json" "!json.workspaces.nohoist && !json.scripts['dev:mobile']"; then
  pass "nohoist と dev:mobile が消える"
else
  fail "ルート package.json に mobile の設定が残っている"
fi

if ! grep -q "expo customize" "$variant/.github/workflows/ci.yml" &&
  ! grep -q "dependency-name: 'expo'" "$variant/.github/dependabot.yml"; then
  pass "CI の Expo ステップと Dependabot の ignore が消える"
else
  fail "Expo 向けの CI / Dependabot 設定が残っている"
fi

if [ -d "$variant/apps/functions" ] && [ -f "$variant/apps/functions/src/lib/billing.ts" ]; then
  pass "functions / billing は残る（mobile は葉の層）"
else
  fail "mobile の削除で functions / billing まで消えた"
fi

if ! grep -q "revenuecatApiKey" "$variant/.env.example" &&
  ! grep -q "REVENUECAT_API_KEY_APPLE" "$variant/.env.example"; then
  pass "RevenueCat の API キー（billing と mobile の交点）が消える"
else
  fail "RevenueCat の API キーが残っている"
fi

if grep -q "STRIPE_SECRET_KEY" "$variant/.env.example"; then
  pass "Stripe の env（mobile に依存しない課金）は残る"
else
  fail "Stripe の env まで消えた"
fi

# 層の交点があるため、外した層の定義を消すだけでは残った層（billing）の定義が
# mobile 側のファイルを指したままになる。刈り込みが効いているかを検証する
if (cd "$variant" && node scripts/check-layers.mjs > /dev/null 2>&1); then
  pass "残った billing の定義から mobile 側の項目が刈り込まれる"
else
  fail "残った層の定義が実態とずれている" "$(cd "$variant" && node scripts/check-layers.mjs 2>&1)"
fi

rm -rf "$variant"
echo ""

# --- 4. functions を外す（billing / mobile が連鎖する） ---
echo "[4] remove-layer.mjs functions（連鎖）"

variant=$(make_variant)
output=$(remove_layers "$variant" functions)

if echo "$output" | grep -q "mobile" && echo "$output" | grep -q "billing"; then
  pass "依存する層（mobile / billing）を連鎖して外す"
else
  fail "連鎖が働いていない" "$output"
fi

if [ ! -e "$variant/apps/functions" ] && [ ! -e "$variant/apps/mobile" ] &&
  [ ! -e "$variant/apps/web/src/lib/api-client.ts" ]; then
  pass "functions / mobile / api-client が消える"
else
  fail "functions 層のファイルが残っている"
fi

if json_has "$variant/firebase.json" "!json.functions && !json.emulators.functions && json.hosting"; then
  pass "firebase.json から functions が消え、hosting は残る"
else
  fail "firebase.json の functions が残っている"
fi

if [ -f "$variant/firestore.rules" ] && [ -d "$variant/apps/web/src/app/login" ]; then
  pass "firebase 層は残る（functions は firebase の子）"
else
  fail "functions の削除で firebase 層まで消えた"
fi

if (cd "$variant" && node scripts/check-layers.mjs > /dev/null 2>&1); then
  pass "連鎖して外した後も check-layers.mjs が通る"
else
  fail "連鎖して外した後に check-layers.mjs が落ちる" "$(cd "$variant" && node scripts/check-layers.mjs 2>&1)"
fi

rm -rf "$variant"
echo ""

# --- 5. firebase を外す（core だけになる） ---
echo "[5] remove-layer.mjs firebase（core 構成）"

variant=$(make_variant)
output=$(remove_layers "$variant" firebase)

if [ ! -e "$variant/firestore.rules" ] && [ ! -e "$variant/apps/functions" ] &&
  [ ! -e "$variant/apps/mobile" ] && [ ! -e "$variant/apps/web/src/components/auth" ]; then
  pass "firebase 以降の層が全て消える"
else
  fail "core 構成に opt-in 層が残っている" "$output"
fi

for kept in \
  apps/web/src/app/page.tsx \
  apps/web/src/app/layout.tsx \
  apps/web/src/middleware.ts \
  packages/shared/src/theme/index.ts \
  packages/shared/src/i18n/index.ts \
  scripts/deploy.sh \
  turbo.json; do
  if [ ! -e "$variant/$kept" ]; then
    fail "core のファイルが消えた: $kept"
  fi
done
pass "core のファイルは残る"

if ! grep -rq "AuthProvider" "$variant/apps/web/src"; then
  pass "layout.tsx の AuthProvider が {children} に置き換わる"
else
  fail "AuthProvider の参照が残っている"
fi

if json_has "$variant/apps/web/package.json" "!json.dependencies.firebase && !json.dependencies['firebase-admin'] && json.dependencies.next"; then
  pass "web から firebase 依存が消え、next は残る"
else
  fail "web の依存が想定どおりでない"
fi

if json_has "$variant/packages/shared/package.json" "!json.dependencies.zustand && !json.dependencies['@geckou/firebase-client'] && Object.keys(json.exports).length === 6"; then
  pass "shared から firebase / zustand 依存とサブパスが消える"
else
  fail "shared の依存・exports が想定どおりでない"
fi

# 外した層への参照が残っていないか（残っていると core 構成でビルドが壊れる）
leftovers=$(grep -rn --exclude-dir=.git --exclude-dir=node_modules \
  -e "@geckou/shared/firebase" -e "@geckou/shared/stores" -e "@geckou/shared/firestore" \
  -e "@geckou/shared/storage" -e "@geckou/billing" -e "@/lib/firebase" -e "@/lib/api-client" \
  "$variant/apps" "$variant/packages" 2>/dev/null)
if [ -z "$leftovers" ]; then
  pass "core 構成に外した層への import が残っていない"
else
  fail "外した層への import が残っている" "$leftovers"
fi

# マーカーは外した層のものだけが消え、残る層のものは残っている
if ! grep -rq "layer:firebase\|layer:billing\|layer:mobile\|layer:functions" \
  "$variant/apps" "$variant/packages" "$variant/scripts" "$variant/.env.example" 2>/dev/null; then
  pass "外した層のマーカーが残っていない"
else
  fail "外した層のマーカーが残っている"
fi

syntax_errors=""
for script in "$variant"/scripts/*.sh; do
  bash -n "$script" 2>/dev/null || syntax_errors="${syntax_errors}${script} "
done
if [ -z "$syntax_errors" ]; then
  pass "core 構成のシェルスクリプトの構文が壊れていない"
else
  fail "シェルスクリプトの構文が壊れた" "$syntax_errors"
fi

if (cd "$variant" && node scripts/check-layers.mjs > /dev/null 2>&1); then
  pass "core 構成でも check-layers.mjs が通る"
else
  fail "core 構成で check-layers.mjs が落ちる" "$(cd "$variant" && node scripts/check-layers.mjs 2>&1)"
fi

json_errors=""
for config in "$variant"/package.json "$variant"/firebase.json "$variant"/apps/web/package.json \
  "$variant"/packages/shared/package.json "$variant"/layers.json; do
  node -e "JSON.parse(require('fs').readFileSync('$config', 'utf8'))" 2>/dev/null ||
    json_errors="${json_errors}${config} "
done
if [ -z "$json_errors" ]; then
  pass "core 構成の JSON が壊れていない"
else
  fail "JSON が壊れた" "$json_errors"
fi

rm -rf "$variant"
echo ""

# --- 6. core は外せない ---
echo "[6] ガード"

variant=$(make_variant)
if remove_layers "$variant" core > /dev/null 2>&1; then
  fail "core が外せてしまう"
else
  pass "core は外せない"
fi

if remove_layers "$variant" no-such-layer > /dev/null 2>&1; then
  fail "未定義の層がエラーにならない"
else
  pass "未定義の層はエラーになる"
fi

before=$(find "$variant" -type f | wc -l)
remove_layers "$variant" --dry-run mobile > /dev/null 2>&1
after=$(find "$variant" -type f | wc -l)
if [ "$before" = "$after" ]; then
  pass "--dry-run はファイルを変更しない"
else
  fail "--dry-run でファイルが変更された"
fi

rm -rf "$variant"
echo ""

echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 ==="

if [ "$failed" -gt 0 ]; then
  exit 1
fi

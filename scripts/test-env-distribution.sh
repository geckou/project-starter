#!/usr/bin/env bash
set -u

# scripts/use-env.sh が配る env ファイルの回帰テスト。
#
# 配布は「どのキーがどのファイルへ行くか」が全てで、間違えると
#   - 足りない: SSR や Functions で undefined になる（本番で初めて分かる）
#   - 多すぎる: 秘密が関数の環境変数として載り、閲覧者ロールから読める
# のどちらかになる。どちらも型チェックにもテストにも引っかからないため、ここで固定する。
#
# 検証するもの（[n] は下のセクション番号）:
#   [1] apps/web/.env が SSR で読むキーと NEXT_PUBLIC_* を持ち、秘密を持たない
#   [2] apps/functions/.env が許可リストのキーだけを持ち、秘密を持たない（functions 層のみ）
#   [3] .env.local は全文コピーされる（ローカル開発と next build はこちらを読む）
#   [4] 環境を切り替えると、前の環境の値が消えて新しい値が入る
#   [5] 許可リストのキーが Cloud Functions の予約語に当たらない
#   [6] デプロイ中は apps/web/.env.local が退避され、終わると戻る
#
# 「ファイルが無いので grep が空振りして緑」を避けるため、内容を見る前に
# 必ず存在を主張する。層を持たない構成では、その層のセクションごと飛ばす。

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

# 内容を検査する前に、そのファイルが在ることを主張する。
# grep -q は対象が無ければ非ゼロを返すため、存在確認を挟まないと
# 「載っていない」系の assert がファイルごと消えても緑のままになる
require_file() {
  if [ -f "$1" ]; then
    pass "$2"
    return 0
  fi

  fail "$2（ファイルが無い）" "$1"
  return 1
}

WORK=$(mktemp -d) || exit 1

if [ -z "$WORK" ] || [ ! -d "$WORK" ]; then
  echo "作業ディレクトリを作れませんでした。" >&2
  exit 1
fi

trap 'rm -rf "$WORK"' EXIT

cp -R "$REPO/scripts" "$WORK/scripts"

# 「.env.<環境名> に無いキーの行は書かない」を検証するため、フィクスチャに
# 存在しないキーを許可リストへ足した版で回す（本体の許可リストは変えない）。
#
# use-env.sh の書式が変わってこの置換が当たらなくなると、検証したい状況が
# そもそも作られないまま全件緑になる。当たったことを下で必ず確かめる
UNSET_KEY_PATCH='WEB_SSR_ENV_KEYS=(\
  UNSET_KEY'
sed -i.bak "s/^WEB_SSR_ENV_KEYS=($/${UNSET_KEY_PATCH}/" "$WORK/scripts/use-env.sh" 2>/dev/null ||
  sed -i '' "s/^WEB_SSR_ENV_KEYS=($/${UNSET_KEY_PATCH}/" "$WORK/scripts/use-env.sh"
rm -f "$WORK/scripts/use-env.sh.bak"

if ! grep -q '^  UNSET_KEY$' "$WORK/scripts/use-env.sh"; then
  echo "テストの前提を作れませんでした。" >&2
  echo "  scripts/use-env.sh の WEB_SSR_ENV_KEYS=( の書式が変わって、" >&2
  echo "  テスト用のキーを差し込む置換が当たらなくなっています。" >&2
  echo "  このまま進めると「.env.<環境名> に無いキーの行は書かない」の検証が" >&2
  echo "  素通りするため、ここで止めます。" >&2
  exit 1
fi
mkdir -p "$WORK/apps/web" "$WORK/apps/functions" "$WORK/apps/mobile"

# [6] で deploy.sh を回すために要るもの（firebase.json / package.json / git）
cat >"$WORK/firebase.json" <<'JSON'
{ "hosting": { "source": "apps/web" } }
JSON
cat >"$WORK/package.json" <<'JSON'
{ "name": "fixture", "private": true, "workspaces": ["apps/*"] }
JSON
cat >"$WORK/apps/web/package.json" <<'JSON'
{ "name": "@fixture/web", "version": "0.0.0" }
JSON
cat >"$WORK/apps/functions/package.json" <<'JSON'
{ "name": "@fixture/functions", "version": "0.0.0" }
JSON
git -C "$WORK" init -q .

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
BASIC_AUTH_CREDENTIALS=user:production-password
NEXT_PUBLIC_GTM_ID=GTM-PRODUCTION
ALLOWED_ORIGINS=https://example.com
ENVFILE

run_use_env() {
  (cd "$WORK" && PATH="$WORK/bin:$PATH" bash scripts/use-env.sh "$1" >"$WORK/use-env.log" 2>&1)
}

echo "=== use-env.sh の配布内容 ==="
echo ""

# functions 層を持たない構成（core / core + firebase）では apps/functions/.env を
# 配らない。採用の判定は use-env.sh に許可リストの宣言が残っているかで行う
# （layers.json を持たない古い派生でも動く）。
#
# ここで層マーカーの文字列そのものを書かないこと。書くと remove-layer.mjs が
# **このファイルのその行を本物のマーカーとみなし**、対応する end が無いため
# ファイル末尾まで削り落とす（実際に踏んで 276 行が 104 行になった）
HAS_FUNCTIONS_LAYER=false
if grep -q '^FUNCTIONS_ENV_KEYS=(' "$REPO/scripts/use-env.sh"; then
  HAS_FUNCTIONS_LAYER=true
fi

echo "[1] apps/web/.env（framework-backed hosting の SSR 関数が読む）"

if ! run_use_env staging; then
  fail "use-env.sh staging が失敗した" "$(cat "$WORK/use-env.log")"
else
  pass "use-env.sh staging が通る"
fi

if require_file "$WORK/apps/web/.env" "apps/web/.env が生成される"; then
  if grep -qx 'BASIC_AUTH_CREDENTIALS=user:staging-password' "$WORK/apps/web/.env"; then
    pass "SSR で読むキーが載る（BASIC_AUTH_CREDENTIALS）"
  else
    fail "BASIC_AUTH_CREDENTIALS が apps/web/.env に無い（dev/stg の Basic 認証が効かない）" \
      "$(cat "$WORK/apps/web/.env")"
  fi

  if grep -q "$SECRET_VALUE" "$WORK/apps/web/.env"; then
    fail "apps/web/.env に秘密が載っている（関数の環境変数は閲覧者ロールから読める）" \
      "$(grep -n "$SECRET_VALUE" "$WORK/apps/web/.env")"
  else
    pass "apps/web/.env に秘密が載らない"
  fi

  # deploy.sh はデプロイ中 .env.local を退避するため、その間の next build は
  # .env から NEXT_PUBLIC_* を読む。載っていないとビルド成果物から値が消える
  if grep -qx 'NEXT_PUBLIC_GTM_ID=GTM-STAGING' "$WORK/apps/web/.env"; then
    pass "apps/web/.env に NEXT_PUBLIC_* が載る（.env.local 退避中のビルド用）"
  else
    fail "apps/web/.env に NEXT_PUBLIC_* が無い（退避中のビルドで値が消える）" \
      "$(cat "$WORK/apps/web/.env")"
  fi

  # .env.<環境名> に無いキーは行を書かない（空の値で上書きしない）
  if grep -q '^UNSET_KEY=' "$WORK/apps/web/.env"; then
    fail "許可リストにあるが .env.staging に無いキーの行が書かれている" \
      "$(grep -n '^UNSET_KEY=' "$WORK/apps/web/.env")"
  else
    pass ".env.<環境名> に無いキーは行を書かない"
  fi
fi

echo ""

if [ "$HAS_FUNCTIONS_LAYER" = true ]; then
  echo "[2] apps/functions/.env（Functions が読む）"

  if require_file "$WORK/apps/functions/.env" "apps/functions/.env が生成される"; then
    if grep -qx 'ALLOWED_ORIGINS=https://staging.example.com' "$WORK/apps/functions/.env"; then
      pass "許可リストのキーが載る（ALLOWED_ORIGINS）"
    else
      fail "ALLOWED_ORIGINS が apps/functions/.env に無い" \
        "$(cat "$WORK/apps/functions/.env")"
    fi

    if grep -q "$SECRET_VALUE" "$WORK/apps/functions/.env"; then
      fail "apps/functions/.env に秘密が載っている" \
        "$(grep -n "$SECRET_VALUE" "$WORK/apps/functions/.env")"
    else
      pass "apps/functions/.env に秘密が載らない"
    fi
  fi
else
  echo "[2] apps/functions/.env — functions 層が無いので飛ばす"
fi

echo ""
echo "[3] .env.local は全文コピー（ローカル開発と next build が読む）"

for target in .env.local apps/web/.env.local; do
  if require_file "$WORK/$target" "$target が生成される"; then
    if grep -q "$SECRET_VALUE" "$WORK/$target"; then
      pass "$target は全文（サーバー専用の値も含む）"
    else
      fail "$target が全文になっていない" "$(cat "$WORK/$target")"
    fi
  fi
done

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

# 「消える」だけでなく「新しい値が入る」ことも見る。
# 見ないと、生成が空になるバグを通してしまう
if grep -qx 'BASIC_AUTH_CREDENTIALS=user:production-password' "$WORK/apps/web/.env" 2>/dev/null; then
  pass "apps/web/.env に切り替え先の値が入る"
else
  fail "apps/web/.env に切り替え先の値が入っていない" "$(cat "$WORK/apps/web/.env" 2>&1)"
fi

if [ "$HAS_FUNCTIONS_LAYER" = true ]; then
  if grep -q 'staging.example.com' "$WORK/apps/functions/.env" 2>/dev/null; then
    fail "apps/functions/.env に前の環境の値が残っている" \
      "$(cat "$WORK/apps/functions/.env")"
  else
    pass "apps/functions/.env に前の環境の値が残らない"
  fi

  if grep -qx 'ALLOWED_ORIGINS=https://example.com' "$WORK/apps/functions/.env" 2>/dev/null; then
    pass "apps/functions/.env に切り替え先の値が入る"
  else
    fail "apps/functions/.env に切り替え先の値が入っていない" \
      "$(cat "$WORK/apps/functions/.env" 2>&1)"
  fi
fi

echo ""
echo "[5] 許可リストのキーが Cloud Functions の予約語に当たらない"

# firebase-tools の lib/functions/env.js が弾くもの。当たると firebase deploy が
# Failed to validate key で止まる（秘密の混入より先に、デプロイ自体が落ちる）
RESERVED_PREFIXES='X_GOOGLE_ FIREBASE_ EXT_'
RESERVED_KEYS='FIREBASE_CONFIG CLOUD_RUNTIME_CONFIG EVENTARC_CLOUD_EVENT_SOURCE ENTRY_POINT GCP_PROJECT GCLOUD_PROJECT GOOGLE_CLOUD_PROJECT FUNCTION_TRIGGER_TYPE FUNCTION_NAME FUNCTION_MEMORY_MB FUNCTION_TIMEOUT_SEC FUNCTION_IDENTITY FUNCTION_REGION FUNCTION_TARGET FUNCTION_SIGNATURE_TYPE K_SERVICE K_REVISION PORT K_CONFIGURATION'

# use-env.sh の許可リストに載っているキーを取り出す
allowlist_keys=$(
  sed -n '/^WEB_SSR_ENV_KEYS=(/,/^)/p;/^FUNCTIONS_ENV_KEYS=(/,/^)/p' "$REPO/scripts/use-env.sh" |
    grep -vE '^(WEB_SSR_ENV_KEYS|FUNCTIONS_ENV_KEYS)=\(|^\)|^\s*#' |
    tr -d ' \t' | grep -v '^$'
)

if [ -z "$allowlist_keys" ]; then
  fail "use-env.sh から許可リストを読み取れない" "検査が素通りしてしまいます"
else
  reserved_hits=""

  while IFS= read -r key; do
    [ -n "$key" ] || continue

    for reserved in $RESERVED_KEYS; do
      [ "$key" = "$reserved" ] && reserved_hits="${reserved_hits}${key}（予約キー）
"
    done

    for prefix in $RESERVED_PREFIXES; do
      case "$key" in
        "$prefix"*) reserved_hits="${reserved_hits}${key}（予約プレフィックス ${prefix}）
" ;;
      esac
    done
  done <<EOF
$allowlist_keys
EOF

  if [ -z "$reserved_hits" ]; then
    pass "許可リストのキーは全て予約語に当たらない"
  else
    fail "許可リストに Cloud Functions の予約語がある（firebase deploy が失敗する）" \
      "$(printf '%s' "$reserved_hits")"
  fi
fi

echo ""
echo "[6] デプロイ中は apps/web/.env.local を退避する（関数へ同梱させない）"

# firebase をスタブに差し替え、deploy.sh が firebase deploy を呼んだ時点の
# ファイルの状態を記録する。framework-backed hosting は apps/web/.env.* を
# 関数のソースへ同梱するため、その瞬間に .env.local が在ってはいけない（#329）
cat >"$WORK/bin/firebase" <<'STUB'
#!/bin/sh
# deploy のときだけ、その時点の apps/web/ の env ファイルを記録する
case "$1" in
  deploy)
    ls -a apps/web 2>/dev/null | grep -E '^\.env' >>"$DEPLOY_SNAPSHOT"
    ;;
esac
exit 0
STUB
chmod +x "$WORK/bin/firebase"

DEPLOY_SNAPSHOT="$WORK/deploy-snapshot.txt"
: >"$DEPLOY_SNAPSHOT"
export DEPLOY_SNAPSHOT

# 事前チェック（type-check / lint / test / build）は node_modules が要るので飛ばす。
# 検証したいのは env ファイルの出し入れだけ
if (cd "$WORK" && PATH="$WORK/bin:$PATH" SKIP_CHECKS=1 FORCE_DEPLOY=1 \
  bash scripts/deploy.sh staging --only hosting >"$WORK/deploy.log" 2>&1); then
  pass "deploy.sh が通る（firebase はスタブ）"
else
  fail "deploy.sh が失敗した" "$(tail -20 "$WORK/deploy.log")"
fi

if [ -s "$DEPLOY_SNAPSHOT" ]; then
  pass "firebase deploy が呼ばれた"

  if grep -qx '.env.local' "$DEPLOY_SNAPSHOT"; then
    fail "デプロイ中に apps/web/.env.local が残っている（秘密が関数へ同梱される）" \
      "$(cat "$DEPLOY_SNAPSHOT")"
  else
    pass "デプロイ中は apps/web/.env.local が無い"
  fi

  if grep -qx '.env' "$DEPLOY_SNAPSHOT"; then
    pass "デプロイ中も apps/web/.env は在る（ビルドと SSR がこれを読む）"
  else
    fail "デプロイ中に apps/web/.env が無い（NEXT_PUBLIC_* とサーバー変数が届かない）" \
      "$(cat "$DEPLOY_SNAPSHOT")"
  fi
else
  fail "firebase deploy が呼ばれていない（検証が素通りしている）" "$(tail -20 "$WORK/deploy.log")"
fi

# 退避したものは必ず戻す。戻らないとローカル開発が壊れる
if [ -f "$WORK/apps/web/.env.local" ]; then
  pass "デプロイ後に apps/web/.env.local が戻る"
else
  fail "apps/web/.env.local が戻っていない（ローカル開発が壊れる）" \
    "$(ls -a "$WORK/apps/web")"
fi

echo ""
echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 ==="

[ "$failed" -eq 0 ]

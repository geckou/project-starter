#!/usr/bin/env bash
set -u

# scripts/lib/hosting-targets.mjs と scripts/lib/deploy-targets.mjs の回帰テスト。
#
# 前半は「どのターゲットに配るか」の判断を切り出した .mjs を直接検証する。
# 後半（[10]〜[12]）は deploy.sh 本体を一時ツリーで回す（firebase はスタブ）。
# --only の扱いと --force の付け方は .mjs に出てこないため、本体を通さないと見えない。
#
# 前半のうち [1]〜[4] は hosting のターゲット選び、[5]〜[9] は環境ごとに
# デプロイ対象を導く部分（関数の展開・ルールの扱い・明示指定）。
#
# hosting-targets.mjs で検証するもの:
#   1. hosting 宣言が無ければ何も出さない（--only hosting のまま）
#   2. target / site 未設定の単一 hosting も何も出さない（テンプレート既定）
#   3. 環境名と同じターゲットがあれば、それ 1 つだけを出す（#323 の本体）
#   4. site での宣言でも環境名で絞り込む
#   5. 環境名と無関係なターゲット名なら従来どおり全部出し、警告する
#   6. 単一ターゲットは名前が環境名と違っても警告しない
#   7. DEPLOY_HOSTING_TARGETS があれば、それを優先する
#   8. DEPLOY_HOSTING_TARGETS に未宣言のターゲットがあれば止める
#   9. DEPLOY_HOSTING_TARGETS が空文字なら止める
#  10. ターゲット未宣言の構成でも、明示指定を黙って捨てない

cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/lib/hosting-targets.mjs"
DEPLOY_TARGETS_SCRIPT="$(pwd)/scripts/lib/deploy-targets.mjs"

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

run "$PER_ENV" staging
if [ -z "$RUN_ERR" ]; then
  pass "他の環境のターゲットを落としても警告しない"
else
  fail "環境名どおりの構成で警告が出た" "$RUN_ERR"
fi

# 同じプロジェクトに別アプリのサイトを相乗りさせた構成（#361）
WITH_PREFIXED='[
  { "target": "develop", "source": "apps/web" },
  { "target": "production", "source": "apps/web" },
  { "target": "lp-develop", "source": "apps/lp" },
  { "target": "lp-production", "source": "apps/lp" }
]'
expect_targets "環境名を含む追加ターゲットは既定では配らない" "production" "$WITH_PREFIXED" production

run "$WITH_PREFIXED" production
if printf '%s' "$RUN_ERR" | grep -q 'lp-production' &&
  printf '%s' "$RUN_ERR" | grep -q "DEPLOY_HOSTING_TARGETS='production lp-production'"; then
  pass "配らなかった追加ターゲットを警告する"
else
  fail "環境名を含む追加ターゲットが無警告で落ちた（#361）" "$RUN_ERR"
fi

if printf '%s' "$RUN_ERR" | grep -q 'lp-develop'; then
  fail "他の環境の追加ターゲットまで警告している" "$RUN_ERR"
else
  pass "他の環境の追加ターゲットは警告しない"
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

# ターゲット未宣言の firebase.json でも、明示指定は黙って捨てない
DEPLOY_HOSTING_TARGETS='web'
run "$SINGLE" staging
if [ "$RUN_STATUS" -ne 0 ]; then
  pass "ターゲット未宣言の構成でも明示指定を検査する"
else
  fail "ターゲット未宣言だと明示指定が黙って捨てられる" "$RUN_OUT"
fi

unset DEPLOY_HOSTING_TARGETS

# ここから deploy-targets.mjs（環境ごとに既定のデプロイ対象を導く。#358 / #408）。
#
# 検証するもの:
#  11. functions を環境の関数へ展開する（develop / staging はグループ、production は名前ごと）
#  12. 宣言が無い・空・壊れているときの扱い
#  13. firestore / storage は production だけが既定で配る
#  14. この環境名の Hosting ターゲットが無ければ、production 以外は hosting も外れる
#  15. --explicit（明示指定）でも functions は展開し、それ以外は素通しして警告する

# 環境ごとにサイトを分けてある firebase.json（相乗り構成の前提）。
# 既定でこれを置き、hosting の扱いを見るときだけ差し替える
HOSTING_SPLIT='[{ "target": "develop", "source": "apps/web" }, { "target": "staging", "source": "apps/web" }, { "target": "production", "source": "apps/web" }]'
HOSTING_SINGLE='{ "source": "apps/web" }'
HOSTING_NAMED_SINGLE='[{ "target": "web", "source": "apps/web" }]'
HOSTING_PARTIAL='[{ "target": "staging", "source": "apps/web" }, { "target": "production", "source": "apps/web" }]'

MANIFEST_DEFAULT='{ "perEnvironment": ["api"], "shared": ["dailyCleanup"] }'
MANIFEST_NONE='-'

# $1: 環境名、$2: 候補ターゲット、$3: 追加フラグ（--explicit）、
# $4: firebase.json の hosting（既定は環境ごとに分けたもの）、
# $5: function-environments.json の中身（既定は MANIFEST_DEFAULT。'-' なら置かない）
run_deploy_targets() {
  rm -rf "$WORK/tree"
  mkdir -p "$WORK/tree/apps/functions"
  printf '{ "hosting": %s }\n' "${4:-$HOSTING_SPLIT}" >"$WORK/tree/firebase.json"

  if [ "${5:-$MANIFEST_DEFAULT}" != "$MANIFEST_NONE" ]; then
    printf '%s\n' "${5:-$MANIFEST_DEFAULT}" >"$WORK/tree/apps/functions/function-environments.json"
  fi

  RUN_STDERR=$(mktemp)
  RUN_OUT=$(node "$DEPLOY_TARGETS_SCRIPT" "$1" "$2" "$WORK/tree" ${3:-} 2>"$RUN_STDERR")
  RUN_STATUS=$?
  RUN_ERR=$(cat "$RUN_STDERR")
  rm -f "$RUN_STDERR"
}

# $1: 説明、$2: 期待する標準出力、$3: 環境名、$4: 候補ターゲット、
# $5: firebase.json の hosting、$6: function-environments.json
expect_deploy_targets() {
  run_deploy_targets "$3" "$4" "" "${5:-}" "${6:-}"

  if [ "$RUN_STATUS" -ne 0 ]; then
    fail "$1（異常終了した）" "$RUN_ERR"
  elif [ "$RUN_OUT" = "$2" ]; then
    pass "$1"
  else
    fail "$1" "期待: '$2' / 実際: '$RUN_OUT'"
  fi
}

ALL_TARGETS='functions,firestore,storage,hosting'

echo ""
echo "[5] functions を環境の関数へ展開する（#408）"
expect_deploy_targets "develop は develop のグループだけ" "functions:develop" develop functions
expect_deploy_targets "staging は staging のグループだけ" "functions:staging" staging functions
expect_deploy_targets "production は環境別と全環境共通の関数を名前で" \
  "functions:api,functions:dailyCleanup" production functions

run_deploy_targets staging functions
if printf '%s' "$RUN_OUT" | grep -qE 'functions:(api|dailyCleanup)'; then
  fail "staging のデプロイに本番の関数が混ざる" "$RUN_OUT"
else
  pass "staging のデプロイに本番の関数が混ざらない"
fi

if [ -z "$RUN_ERR" ]; then
  pass "展開しただけでは警告しない"
else
  fail "展開しただけで警告が出た" "$RUN_ERR"
fi

expect_deploy_targets "全環境共通の関数だけなら develop は配らない" "" develop functions \
  "" '{ "perEnvironment": [], "shared": ["dailyCleanup"] }'
expect_deploy_targets "全環境共通の関数だけでも production は配る" "functions:dailyCleanup" \
  production functions "" '{ "perEnvironment": [], "shared": ["dailyCleanup"] }'
expect_deploy_targets "グループを持たない環境名では関数を配らない" "" preview functions

echo ""
echo "[6] 関数の宣言が無い・壊れている"
expect_deploy_targets "宣言が無ければ develop は関数を配らない" "" develop functions "" "$MANIFEST_NONE"
expect_deploy_targets "宣言が無くても production は従来どおり全部配る" "functions" \
  production functions "" "$MANIFEST_NONE"

run_deploy_targets staging functions "" "" "$MANIFEST_NONE"
if printf '%s' "$RUN_ERR" | grep -q 'function-environments.json'; then
  pass "宣言が無いことを警告する"
else
  fail "宣言が無いまま黙って関数を外している" "$RUN_ERR"
fi

run_deploy_targets staging functions "" "" '{ "perEnvironment": "api" }'
if [ "$RUN_STATUS" -ne 0 ] && [ -z "$RUN_OUT" ]; then
  pass "形の崩れた宣言では止める"
else
  fail "形の崩れた宣言で素通しした" "status=$RUN_STATUS / out='$RUN_OUT'"
fi

run_deploy_targets production functions "" "" '{ "perEnvironment": ["api", "develop"], "shared": [] }'
if [ "$RUN_STATUS" -ne 0 ] && [ -z "$RUN_OUT" ]; then
  pass "環境名と同じ関数名の宣言では止める（functions:develop が曖昧になる）"
else
  fail "環境名と同じ関数名の宣言で素通しした" "status=$RUN_STATUS / out='$RUN_OUT'"
fi

run_deploy_targets production functions "" "" '{ "perEnvironment": ["api"], "shared": ["api"] }'
if [ "$RUN_STATUS" -ne 0 ]; then
  pass "重複した関数名の宣言では止める"
else
  fail "重複した関数名の宣言で素通しした" "out='$RUN_OUT'"
fi

run_deploy_targets staging functions "" "" '{ broken'
if [ "$RUN_STATUS" -ne 0 ]; then
  pass "JSON として読めない宣言では止める"
else
  fail "読めない宣言で素通しした" "out='$RUN_OUT'"
fi

echo ""
echo "[7] firestore / storage は production だけが既定で配る（#358）"
expect_deploy_targets "develop の既定からルールを外す" "functions:develop,hosting" develop "$ALL_TARGETS"
expect_deploy_targets "staging の既定からも外す" "functions:staging,hosting" staging "$ALL_TARGETS"
expect_deploy_targets "production は全部配る" \
  "functions:api,functions:dailyCleanup,firestore,storage,hosting" production "$ALL_TARGETS"

run_deploy_targets develop "$ALL_TARGETS"
if printf '%s' "$RUN_ERR" | grep -q -- '--only firestore,storage'; then
  pass "外した理由と明示指定の方法を出す"
else
  fail "外したことを黙って行っている" "$RUN_ERR"
fi

echo ""
echo "[8] この環境の Hosting ターゲットが無い場合"
expect_deploy_targets "サイトが 1 つなら hosting も外す（本番のサイトを上書きするため）" "functions:develop" \
  develop "$ALL_TARGETS" "$HOSTING_SINGLE"
expect_deploy_targets "名前付きでもサイトが 1 つなら外す" "functions:develop" \
  develop "$ALL_TARGETS" "$HOSTING_NAMED_SINGLE"
expect_deploy_targets "環境名のターゲットが無ければ外す（全ターゲットに配られるため）" "functions:develop" \
  develop "$ALL_TARGETS" "$HOSTING_PARTIAL"
expect_deploy_targets "同じ宣言でも、自分のターゲットがある環境は配る" "functions:staging,hosting" \
  staging "$ALL_TARGETS" "$HOSTING_PARTIAL"
expect_deploy_targets "production は hosting を配る" "hosting" \
  production hosting "$HOSTING_SINGLE"
expect_deploy_targets "hosting を持たない構成では hosting を外さない" "hosting" \
  develop hosting "null"
expect_deploy_targets "全部外れたら空になる" "" develop "firestore,storage,hosting" "$HOSTING_SINGLE"

# 配る先を人が明示しているなら、その判断を尊重する
DEPLOY_HOSTING_TARGETS='web'
export DEPLOY_HOSTING_TARGETS
expect_deploy_targets "DEPLOY_HOSTING_TARGETS があれば hosting を外さない" "hosting" \
  develop hosting "$HOSTING_NAMED_SINGLE"
unset DEPLOY_HOSTING_TARGETS

run_deploy_targets develop hosting "" "$HOSTING_SINGLE"
if printf '%s' "$RUN_ERR" | grep -q 'Hosting ターゲットを用意'; then
  pass "hosting を外した理由と直し方を出す"
else
  fail "hosting を黙って外している" "$RUN_ERR"
fi

if printf '%s' "$RUN_ERR" | grep -qE -- '--only[^ ]*hosting'; then
  fail "hosting を --only で配るよう案内している（本番のサイトを上書きする）" "$RUN_ERR"
else
  pass "hosting は --only での回避を案内しない"
fi

# firebase.json だけ読めない場合は hosting を外さない（判断材料が無いため）
rm -rf "$WORK/tree"
mkdir -p "$WORK/tree"
RUN_OUT=$(node "$DEPLOY_TARGETS_SCRIPT" develop hosting "$WORK/tree" 2>/dev/null)

if [ "$RUN_OUT" = "hosting" ]; then
  pass "firebase.json が読めないときは hosting を外さない"
else
  fail "firebase.json が無いと hosting の扱いが変わる" "実際: '$RUN_OUT'"
fi

echo ""
echo "[9] 明示指定（--only）"
run_deploy_targets staging "functions,hosting" --explicit
if [ "$RUN_OUT" = "functions:staging,hosting" ]; then
  pass "--only functions も環境の関数へ展開する（本番の関数を上書きしない）"
else
  fail "--only functions が展開されない" "$RUN_OUT"
fi

run_deploy_targets production "functions" --explicit
if [ "$RUN_OUT" = "functions:api,functions:dailyCleanup" ] && [ -z "$RUN_ERR" ]; then
  pass "production の --only functions は名前ごとに展開し、警告しない"
else
  fail "production の --only functions の扱いが違う" "out='$RUN_OUT' / $RUN_ERR"
fi

run_deploy_targets staging "functions:staging-api" --explicit
if [ "$RUN_OUT" = "functions:staging-api" ] && [ -z "$RUN_ERR" ]; then
  pass "自分のグループの個別指定は素通しし、警告しない"
else
  fail "自分のグループの個別指定の扱いが違う" "out='$RUN_OUT' / $RUN_ERR"
fi

run_deploy_targets staging "functions:api" --explicit
if [ "$RUN_OUT" = "functions:api" ] && printf '%s' "$RUN_ERR" | grep -q 'グループの外'; then
  pass "グループの外の個別指定は素通しし、警告する"
else
  fail "グループの外の個別指定を黙って受けている" "out='$RUN_OUT' / $RUN_ERR"
fi

run_deploy_targets develop "firestore,storage" --explicit
if [ "$RUN_OUT" = "firestore,storage" ] && printf '%s' "$RUN_ERR" | grep -q '全環境'; then
  pass "ルールの明示指定は素通しし、全環境に配ることを警告する"
else
  fail "ルールの明示指定の扱いが違う" "out='$RUN_OUT' / $RUN_ERR"
fi

run_deploy_targets develop "hosting" --explicit "$HOSTING_SINGLE"
if printf '%s' "$RUN_ERR" | grep -q '同じサイトへ配ります'; then
  pass "サイトを分けていない構成の --only hosting を警告する"
else
  fail "--only hosting が他の環境のサイトを黙って上書きする" "$RUN_ERR"
fi

run_deploy_targets develop "hosting" --explicit "$HOSTING_SPLIT"
if [ -z "$RUN_ERR" ]; then
  pass "サイトを分けてあれば --only hosting は警告しない"
else
  fail "サイトを分けてあるのに警告が出た" "$RUN_ERR"
fi

run_deploy_targets production "firestore,storage,hosting" --explicit "$HOSTING_SINGLE"
if [ -z "$RUN_ERR" ]; then
  pass "production の明示指定では警告しない"
else
  fail "production の明示指定で毎回警告が出る" "$RUN_ERR"
fi

run_deploy_targets staging "functions" --explicit "" "$MANIFEST_NONE"
if [ -z "$RUN_OUT" ] && printf '%s' "$RUN_ERR" | grep -q 'function-environments.json'; then
  pass "宣言が無ければ --only functions も配らず、理由を出す"
else
  fail "宣言が無いのに --only functions を素通しした" "out='$RUN_OUT' / $RUN_ERR"
fi


echo ""
echo "=== deploy.sh のガード（firebase はスタブ）==="
echo ""

# ここから先は deploy.sh 本体を一時ツリーで回す。firebase CLI を呼ぶ手前の
# 判断（--only の扱い・--force の付け方）は、切り出した .mjs では見えないため
DEPLOY_TREE=$(mktemp -d) || exit 1
REPO=$(pwd)

cp -R "$REPO/scripts" "$DEPLOY_TREE/scripts"
mkdir -p "$DEPLOY_TREE/apps/web" "$DEPLOY_TREE/apps/functions" \
  "$DEPLOY_TREE/apps/mobile" "$DEPLOY_TREE/bin"
printf '{ "hosting": { "source": "apps/web" }, "functions": { "source": "apps/functions" } }\n' \
  >"$DEPLOY_TREE/firebase.json"
printf '{ "name": "fixture", "private": true, "workspaces": ["apps/*"] }\n' \
  >"$DEPLOY_TREE/package.json"
printf '{ "name": "@fixture/web", "version": "0.0.0" }\n' >"$DEPLOY_TREE/apps/web/package.json"
printf '{ "name": "@fixture/functions", "version": "0.0.0" }\n' >"$DEPLOY_TREE/apps/functions/package.json"
printf '{ "perEnvironment": ["api"], "shared": [] }\n' >"$DEPLOY_TREE/apps/functions/function-environments.json"
printf 'NEXT_PUBLIC_X=1\n' >"$DEPLOY_TREE/.env.staging"
git -C "$DEPLOY_TREE" init -q .

# firebase の呼び出しを引数ごと記録するスタブ
cat >"$DEPLOY_TREE/bin/firebase" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >>"$FIREBASE_CALLS"
exit 0
STUB
chmod +x "$DEPLOY_TREE/bin/firebase"

FIREBASE_CALLS="$DEPLOY_TREE/firebase-calls.txt"
export FIREBASE_CALLS

# deploy.sh へ引数を渡して実行する。呼び出し記録は毎回リセットする。
#
# stdin を /dev/null に固定するのは、端末から実行したときに deploy.sh の
# `[ -t 0 ]` が真になり、auto が --force を外して結果が変わるため
# （回帰テストが実行環境に依存しなくなる）。
# FUNCTIONS_FORCE も既定値を明示して、外の環境変数を持ち込まない
run_deploy() {
  : >"$FIREBASE_CALLS"
  (cd "$DEPLOY_TREE" && PATH="$DEPLOY_TREE/bin:$PATH" SKIP_CHECKS=1 \
    FUNCTIONS_FORCE="${FUNCTIONS_FORCE_OVERRIDE:-auto}" \
    bash scripts/deploy.sh "$@" >"$DEPLOY_TREE/deploy.log" 2>&1 < /dev/null)
}

echo "[10] --only の値"

if run_deploy staging --only ""; then
  fail "--only \"\" が通ってしまう（既定の全ターゲットへ反転する）" \
    "$(grep '^deploy' "$FIREBASE_CALLS")"
else
  pass "--only \"\" はエラーで止まる"
fi

if grep -q '^deploy' "$FIREBASE_CALLS"; then
  fail "--only \"\" で止めたのに firebase deploy が呼ばれている" "$(cat "$FIREBASE_CALLS")"
else
  pass "--only \"\" では firebase deploy を呼ばない"
fi

if run_deploy staging --only hosting; then
  pass "--only hosting は通る（スタブ）"
else
  fail "--only hosting が失敗した" "$(tail -20 "$DEPLOY_TREE/deploy.log")"
fi

echo ""
echo "[11] functions の --force"

# 既定（auto）で非対話なら付ける。CI はプロンプトに答えられないため
if run_deploy staging --only functions &&
  grep -q 'deploy --only functions:staging --force' "$FIREBASE_CALLS"; then
  pass "非対話（CI）では functions にも --force を付ける"
else
  fail "非対話で --force が付かない（CI がプロンプト待ちで止まる）" "$(cat "$FIREBASE_CALLS")"
fi

# FUNCTIONS_FORCE=never で外れること（対話端末の既定と同じ経路）
if FUNCTIONS_FORCE_OVERRIDE=never run_deploy staging --only functions &&
  grep -q 'deploy --only functions:staging$' "$FIREBASE_CALLS"; then
  pass "FUNCTIONS_FORCE=never なら --force を付けない（関数の削除に確認が入る）"
else
  fail "FUNCTIONS_FORCE=never でも --force が付く" "$(cat "$FIREBASE_CALLS")"
fi

# hosting は対象外（--force は確認を飛ばすだけで、削除を含まない）
if FUNCTIONS_FORCE_OVERRIDE=never run_deploy staging --only hosting &&
  grep -q 'deploy --only hosting --force' "$FIREBASE_CALLS"; then
  pass "hosting の --force は外さない"
else
  fail "hosting の --force まで外れた" "$(cat "$FIREBASE_CALLS")"
fi

# functions を含まない対象では、FUNCTIONS_FORCE の値で挙動が変わらない。
# 変わると「関数の設定がルールのデプロイまで動かす」ことになる
if FUNCTIONS_FORCE_OVERRIDE=never run_deploy staging --only firestore &&
  grep -q 'deploy --only firestore --force' "$FIREBASE_CALLS"; then
  pass "functions を含まない対象には FUNCTIONS_FORCE が効かない"
else
  fail "functions 以外のデプロイまで --force が外れた" "$(cat "$FIREBASE_CALLS")"
fi

# 打ち間違い（never のつもりの nerver 等）を黙って auto に落とさない
if FUNCTIONS_FORCE_OVERRIDE=nerver run_deploy staging --only functions; then
  fail "FUNCTIONS_FORCE の不正な値が素通りする（非対話では --force が付く）" \
    "$(cat "$FIREBASE_CALLS")"
else
  pass "FUNCTIONS_FORCE の不正な値はエラーで止まる"
fi

echo ""
echo "[12] 中断したらそこで止まる"

# firebase の実行中に INT を受けたら、復元して**そこで終わる**こと。
# 復元だけして継続すると、以降の EXIT トラップが無処理になったまま
# 後続の firebase deploy が走る（#357）
cat >"$DEPLOY_TREE/bin/firebase" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >>"$FIREBASE_CALLS"

# 最初の deploy の最中に、呼び出し元（deploy.sh）へ INT を送る
case "$1" in
  (deploy)
    if [ ! -f "$FIREBASE_CALLS.interrupted" ]; then
      : >"$FIREBASE_CALLS.interrupted"
      kill -INT "$PPID"
      sleep 2
    fi
    ;;
esac
exit 0
STUB
chmod +x "$DEPLOY_TREE/bin/firebase"
rm -f "$FIREBASE_CALLS.interrupted"

run_deploy staging --only firestore,hosting
interrupt_status=$?

if [ "$interrupt_status" -ne 0 ]; then
  pass "中断したら 0 以外で終わる（終了コード: ${interrupt_status}）"
else
  fail "中断しても正常終了として扱われる" "$(tail -5 "$DEPLOY_TREE/deploy.log")"
fi

if [ "$(grep -c '^deploy' "$FIREBASE_CALLS")" -eq 1 ]; then
  pass "中断のあとに後続のデプロイを実行しない"
else
  fail "中断後もデプロイが続いた" "$(cat "$FIREBASE_CALLS")"
fi

rm -rf "$DEPLOY_TREE"

echo ""
echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 ==="

[ "$failed" -eq 0 ]

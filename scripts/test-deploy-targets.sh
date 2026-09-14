#!/usr/bin/env bash
set -u

# scripts/lib/hosting-targets.mjs と scripts/lib/deploy-targets.mjs の回帰テスト。
#
# 前半は「どのターゲットに配るか」の判断を切り出した .mjs を直接検証する。
# 後半（[9] [10]）は deploy.sh 本体を一時ツリーで回す（firebase はスタブ）。
# --only の扱いと --force の付け方は .mjs に出てこないため、本体を通さないと見えない。
#
# 前半（[1]〜[4]）は hosting のターゲット選び、後半（[5]〜[8]）は
# .firebaserc の構成から既定のデプロイ対象を導く部分。
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

# ここから deploy-targets.mjs（.firebaserc の構成から既定のデプロイ対象を導く）。
#
# 検証するもの:
#  11. 環境ごとにプロジェクトを分ける構成では既定を変えない
#  12. 相乗り構成では、本番側でない環境の既定から functions / firestore / storage が外れる
#  13. 相乗り構成でも、共有する環境のうち最も本番側の 1 つは配る
#  14. default エイリアスは環境として数えない
#  15. 相乗り構成で、この環境名の Hosting ターゲットが無ければ hosting も外れる
#  16. --explicit（明示指定）は素通しし、他の環境にも配ることを警告する
#  17. .firebaserc が読めなくてもデプロイを止めない

# 環境ごとにサイトを分けてある firebase.json（相乗り構成の前提）。
# 既定でこれを置き、hosting の扱いを見るときだけ差し替える
HOSTING_SPLIT='[{ "target": "develop", "source": "apps/web" }, { "target": "staging", "source": "apps/web" }, { "target": "production", "source": "apps/web" }]'
HOSTING_SINGLE='{ "source": "apps/web" }'
HOSTING_NAMED_SINGLE='[{ "target": "web", "source": "apps/web" }]'
HOSTING_PARTIAL='[{ "target": "staging", "source": "apps/web" }, { "target": "production", "source": "apps/web" }]'

# $1: .firebaserc の projects（JSON）、$2: 環境名、$3: 候補ターゲット、
# $4: 追加フラグ（--explicit）、$5: firebase.json の hosting（既定は環境ごとに分けたもの）
run_deploy_targets() {
  printf '{ "projects": %s }\n' "$1" >"$WORK/.firebaserc"
  printf '{ "hosting": %s }\n' "${5:-$HOSTING_SPLIT}" >"$WORK/firebase.json"

  RUN_STDERR=$(mktemp)
  RUN_OUT=$(node "$DEPLOY_TARGETS_SCRIPT" "$2" "$3" "$WORK/.firebaserc" ${4:-} 2>"$RUN_STDERR")
  RUN_STATUS=$?
  RUN_ERR=$(cat "$RUN_STDERR")
  rm -f "$RUN_STDERR"
}

# $1: 説明、$2: 期待する標準出力、$3: projects、$4: 環境名、$5: 候補ターゲット、
# $6: firebase.json の hosting
expect_deploy_targets() {
  run_deploy_targets "$3" "$4" "$5" "" "${6:-}"

  if [ "$RUN_STATUS" -ne 0 ]; then
    fail "$1（異常終了した）" "$RUN_ERR"
  elif [ "$RUN_OUT" = "$2" ]; then
    pass "$1"
  else
    fail "$1" "期待: '$2' / 実際: '$RUN_OUT'"
  fi
}

SEPARATE='{ "default": "app-develop", "develop": "app-develop", "staging": "app-staging", "production": "app-production" }'
SHARED='{ "default": "app", "develop": "app", "staging": "app", "production": "app" }'
PARTIAL='{ "default": "app-dev", "develop": "app-dev", "staging": "app-dev", "production": "app-production" }'
ALL_TARGETS='functions,firestore,storage,hosting'

echo ""
echo "[5] 環境ごとに Firebase プロジェクトを分ける構成"
expect_deploy_targets "既定のターゲットをそのまま使う" "$ALL_TARGETS" "$SEPARATE" develop "$ALL_TARGETS"
expect_deploy_targets "production でも変わらない" "$ALL_TARGETS" "$SEPARATE" production "$ALL_TARGETS"
expect_deploy_targets "サイトが 1 つでも絞り込まない" "$ALL_TARGETS" "$SEPARATE" develop "$ALL_TARGETS" "$HOSTING_SINGLE"

run_deploy_targets "$SEPARATE" develop "$ALL_TARGETS"
if [ -z "$RUN_ERR" ]; then
  pass "分離構成では警告しない"
else
  fail "分離構成で警告が出た" "$RUN_ERR"
fi

echo ""
echo "[6] 1 プロジェクトに環境を相乗りさせる構成（#358）"
expect_deploy_targets "develop の既定からプロジェクト単位のターゲットを外す" "hosting" "$SHARED" develop "$ALL_TARGETS"
expect_deploy_targets "staging の既定からも外す" "hosting" "$SHARED" staging "$ALL_TARGETS"
expect_deploy_targets "共有する環境のうち production だけが配る" "$ALL_TARGETS" "$SHARED" production "$ALL_TARGETS"

expect_deploy_targets "一部だけ共有: develop は外れる" "hosting" "$PARTIAL" develop "$ALL_TARGETS"
expect_deploy_targets "一部だけ共有: staging は配る側" "$ALL_TARGETS" "$PARTIAL" staging "$ALL_TARGETS"
expect_deploy_targets "一部だけ共有: 独立した production は影響を受けない" "$ALL_TARGETS" "$PARTIAL" production "$ALL_TARGETS"

# default を環境として数えると qa と共有していることになり、どちらも rank -1 で
# 「誰も配らない」に落ちる。除外できていれば qa は単独の環境として全部配る
expect_deploy_targets "default エイリアスは環境として数えない" "$ALL_TARGETS" \
  '{ "default": "app", "qa": "app" }' qa "$ALL_TARGETS"

run_deploy_targets "$SHARED" develop "$ALL_TARGETS"
if printf '%s' "$RUN_ERR" | grep -q -- '--only functions,firestore,storage'; then
  pass "外した理由と明示指定の方法を出す"
else
  fail "外したことを黙って行っている" "$RUN_ERR"
fi

expect_deploy_targets "未知の環境名だけで共有しているときは配らない" "" \
  '{ "qa": "app", "qa2": "app" }' qa "$ALL_TARGETS"
expect_deploy_targets ".firebaserc に無い環境名は絞り込まない" "$ALL_TARGETS" "$SHARED" preview "$ALL_TARGETS"

echo ""
echo "[7] 相乗り構成で、この環境の Hosting ターゲットが無い場合"
expect_deploy_targets "サイトが 1 つなら hosting も外す（本番のサイトを上書きするため）" "" \
  "$SHARED" develop "$ALL_TARGETS" "$HOSTING_SINGLE"
expect_deploy_targets "名前付きでもサイトが 1 つなら外す" "" \
  "$SHARED" develop "$ALL_TARGETS" "$HOSTING_NAMED_SINGLE"
expect_deploy_targets "環境名のターゲットが無ければ外す（全ターゲットに配られるため）" "" \
  "$SHARED" develop "$ALL_TARGETS" "$HOSTING_PARTIAL"
expect_deploy_targets "同じ宣言でも、自分のターゲットがある環境は配る" "$ALL_TARGETS" \
  "$SHARED" production "$ALL_TARGETS" "$HOSTING_PARTIAL"
expect_deploy_targets "配る側（production）は hosting も配る" "$ALL_TARGETS" \
  "$SHARED" production "$ALL_TARGETS" "$HOSTING_SINGLE"
expect_deploy_targets "サイトを分けてあれば hosting は残る" "hosting" \
  "$SHARED" develop "$ALL_TARGETS" "$HOSTING_SPLIT"
expect_deploy_targets "hosting を持たない構成では hosting を外さない" "$ALL_TARGETS" \
  "$SEPARATE" develop "$ALL_TARGETS" "null"

# 配る先を人が明示しているなら、その判断を尊重する
DEPLOY_HOSTING_TARGETS='web'
export DEPLOY_HOSTING_TARGETS
expect_deploy_targets "DEPLOY_HOSTING_TARGETS があれば hosting を外さない" "hosting" \
  "$SHARED" develop "$ALL_TARGETS" "$HOSTING_NAMED_SINGLE"
unset DEPLOY_HOSTING_TARGETS

run_deploy_targets "$SHARED" develop "$ALL_TARGETS" "" "$HOSTING_SINGLE"
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

echo ""
echo "[8] 明示指定（--only）と異常系"
run_deploy_targets "$SHARED" develop "functions,hosting" --explicit
if [ "$RUN_OUT" = "functions,hosting" ]; then
  pass "明示指定は素通しする"
else
  fail "明示指定が書き換えられた" "$RUN_OUT"
fi

if printf '%s' "$RUN_ERR" | grep -q 'staging / production'; then
  pass "他の環境にも配ることを警告する"
else
  fail "相乗り構成で明示指定を黙って受けている" "$RUN_ERR"
fi

run_deploy_targets "$SHARED" develop "functions:api" --explicit
if printf '%s' "$RUN_ERR" | grep -q 'functions:api'; then
  pass "functions:api のような個別指定も警告の対象にする"
else
  fail "個別指定が警告から漏れた" "$RUN_ERR"
fi

run_deploy_targets "$SHARED" develop "hosting" --explicit "$HOSTING_SINGLE"
if printf '%s' "$RUN_ERR" | grep -q '同じサイトへ配ります'; then
  pass "サイトを分けていない構成の --only hosting を警告する"
else
  fail "--only hosting が他の環境のサイトを黙って上書きする" "$RUN_ERR"
fi

run_deploy_targets "$SHARED" develop "hosting" --explicit "$HOSTING_SPLIT"
if [ -z "$RUN_ERR" ]; then
  pass "サイトを分けてあれば --only hosting は警告しない"
else
  fail "サイトを分けてあるのに警告が出た" "$RUN_ERR"
fi

run_deploy_targets "$SHARED" production "functions,hosting" --explicit
if [ -z "$RUN_ERR" ]; then
  pass "配る側（production）の明示指定では警告しない"
else
  fail "配る側の明示指定で毎回警告が出る" "$RUN_ERR"
fi

run_deploy_targets "$SEPARATE" develop "functions,hosting" --explicit
if [ -z "$RUN_ERR" ]; then
  pass "分離構成の明示指定では警告しない"
else
  fail "分離構成の明示指定で警告が出た" "$RUN_ERR"
fi

RUN_STDERR=$(mktemp)
RUN_OUT=$(node "$DEPLOY_TARGETS_SCRIPT" develop "$ALL_TARGETS" "$WORK/missing.firebaserc" 2>"$RUN_STDERR")
RUN_STATUS=$?
RUN_ERR=$(cat "$RUN_STDERR")
rm -f "$RUN_STDERR"

if [ "$RUN_STATUS" -eq 0 ] && [ "$RUN_OUT" = "$ALL_TARGETS" ] && [ -n "$RUN_ERR" ]; then
  pass ".firebaserc が読めないときは警告して素通しする"
else
  fail ".firebaserc が読めないとデプロイが止まる" "status=$RUN_STATUS / out='$RUN_OUT' / $RUN_ERR"
fi

# firebase.json だけ読めない場合は hosting を外さない（判断材料が無いため）
rm -f "$WORK/firebase.json"
printf '{ "projects": %s }\n' "$SHARED" >"$WORK/.firebaserc"
RUN_OUT=$(node "$DEPLOY_TARGETS_SCRIPT" develop "$ALL_TARGETS" "$WORK/.firebaserc" 2>/dev/null)

if [ "$RUN_OUT" = "hosting" ]; then
  pass "firebase.json が読めないときは hosting を外さない"
else
  fail "firebase.json が無いと hosting の扱いが変わる" "実際: '$RUN_OUT'"
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

echo "[9] --only の値"

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
echo "[10] functions の --force"

# 既定（auto）で非対話なら付ける。CI はプロンプトに答えられないため
if run_deploy staging --only functions &&
  grep -q 'deploy --only functions --force' "$FIREBASE_CALLS"; then
  pass "非対話（CI）では functions にも --force を付ける"
else
  fail "非対話で --force が付かない（CI がプロンプト待ちで止まる）" "$(cat "$FIREBASE_CALLS")"
fi

# FUNCTIONS_FORCE=never で外れること（対話端末の既定と同じ経路）
if FUNCTIONS_FORCE_OVERRIDE=never run_deploy staging --only functions &&
  grep -q 'deploy --only functions$' "$FIREBASE_CALLS"; then
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
echo "[11] 中断したらそこで止まる"

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

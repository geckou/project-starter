#!/bin/bash
set -u

# .claude/hooks/pre-git-guard.sh の回帰テスト。
#
# サンドボックスに「セッションのリポジトリ」と「別リポジトリ」を作り、
# フックへ PreToolUse の入力 JSON を直接流して終了コードを検証する。
# deny は exit 2、許可（ask を含む）は exit 0。
#
# node_modules に依存しないので yarn install なしで実行できる。
# 実体を package.json ではなくこのスクリプトに置いている理由は
# scripts/test-rules.sh と同じ（ルート package.json は Template Sync の対象外）。

cd "$(dirname "$0")/.."
REPO=$(pwd -P)
HOOK=$REPO/.claude/hooks/pre-git-guard.sh

if ! command -v jq >/dev/null 2>&1; then
  echo 'jq が無いためフックのテストをスキップします（フック自体も jq 無しでは何もしません）'
  exit 0
fi

SANDBOX=$(mktemp -d)
SANDBOX=$(cd "$SANDBOX" && pwd -P)
trap 'rm -rf "$SANDBOX"' EXIT

SESSION=$SANDBOX/session-repo
OTHER=$SANDBOX/other-repo
# 空白を含むパスの扱いを検証するためのリポジトリ
SPACED="$SANDBOX/other repo"

# 既定ブランチ名の指定に init -b / init.defaultBranch を使わないのは、
# 古い git（< 2.28）でも動かすため
init_repo() {
  git init -q "$1"
  git -C "$1" symbolic-ref HEAD "refs/heads/$2"
  git -C "$1" -c user.email=test@example.com -c user.name=test \
    commit -q --allow-empty -m 'chore: init'
  # フックの fetch 鮮度チェック（直近15分以内）を通すため
  touch "$1/.git/FETCH_HEAD"
}

init_repo "$SESSION" production
git -C "$SESSION" branch feat/existing
git -C "$SESSION" branch release/1.0.0

init_repo "$OTHER" main
init_repo "$SPACED" main

pass=0
fail=0
LAST_OUT=''

# run <期待する終了コード> <説明> <コマンド> [セッション側の現在ブランチ]
run() {
  want=$1
  desc=$2
  command=$3
  branch=${4:-production}

  git -C "$SESSION" checkout -q "$branch"

  LAST_OUT=$(cd "$SESSION" && jq -n --arg c "$command" '{tool_input:{command:$c}}' |
    sh "$HOOK" 2>&1)
  status=$?

  if [ "$status" = "$want" ]; then
    pass=$((pass + 1))
    printf 'ok   [%s] %s\n' "$status" "$desc"
  else
    fail=$((fail + 1))
    printf 'FAIL [want %s got %s] %s\n     cmd: %s\n     out: %s\n' \
      "$want" "$status" "$desc" "$command" "$LAST_OUT"
  fi
}

# refute <部分文字列> <説明>: 直前の run の出力に現れてはいけない文字列
refute() {
  case "$LAST_OUT" in
    *"$1"*)
      fail=$((fail + 1))
      printf 'FAIL %s\n     out: %s\n' "$2" "$LAST_OUT"
      ;;
    *)
      pass=$((pass + 1))
      printf 'ok   [-] %s\n' "$2"
      ;;
  esac
}

echo '=== 別リポジトリへの操作は素通りする ==='
run 0 'cd で別リポジトリへ移動してから commit' "cd $OTHER && git commit -m 'なにか'"
run 0 'cd 先の既定ブランチへ commit（セッションは production）' \
  "cd $OTHER && git add -A && git commit -m 'wip'"
run 0 'cd 先でブランチ作成（命名規則も分岐元も見ない）' \
  "cd $OTHER && git checkout -b feature_x main"
run 0 'cd 先で production へ push' "cd $OTHER && git push origin production"
run 0 'git -C で別リポジトリを指定' "git -C $OTHER commit -m 'wip'"
run 0 'cd したまま戻らずに git' "cd $OTHER; git checkout -b x"
run 0 'cd のパスに空白がある（ダブルクォート）' \
  "cd \"$SPACED\" && git commit -m 'なにか'"
run 0 'cd のパスに空白がある（シングルクォート）' \
  "cd '$SPACED' && git commit -m 'なにか'"
run 0 'git -C のパスに空白がある' "git -C \"$SPACED\" commit -m 'なにか'"
run 0 'サブシェル内で別リポジトリへ cd' "(cd $OTHER && git commit -m 'なにか')"

echo
echo '=== サブシェルの cd は親スコープへ漏らさない ==='
run 2 'サブシェルを抜けた後の production 直コミット' \
  "(cd $OTHER && git status) && git commit -m 'feat: x'"
run 2 'サブシェルを抜けた後のブランチ命名規則違反' \
  "(cd $OTHER && git status) && git checkout -b wip"
run 0 'サブシェル内の cd は閉じ括弧まで有効' \
  "(cd $OTHER && git checkout -b feature_x)"

echo
echo '=== セッションのリポジトリへの操作は検査する ==='
run 2 'production への直接コミット' "git commit -m 'feat: なにか'"
run 2 'コミットメッセージ規約違反' "git commit -m 'なにか'" feat/existing
run 0 '規約に沿ったコミット' "git commit -m 'feat: なにかを追加'" feat/existing
run 2 'production への直接 push' 'git push origin production'
run 2 'release/* への force push' 'git push --force origin release/1.0.0' feat/existing
run 0 'release/* への push は ask（deny ではない）' \
  'git push origin release/1.0.0' feat/existing
run 2 '--no-verify による検証スキップ' "git commit --no-verify -m 'feat: x'" feat/existing
run 2 'cd で戻ってきた後の production コミット' \
  "cd $OTHER && cd $SESSION && git commit -m 'feat: x'"
run 2 'git -C でセッションのリポジトリを指定' \
  "cd $OTHER && git -C $SESSION commit -m 'なにか'"
run 2 'git -C . での production 直コミット' "git -C . commit -m 'feat: x'"
run 2 'git -C のパスがクォート付き（セッションのリポジトリ）' \
  "git -C \"$SESSION\" commit -m 'なにか'"
run 2 '解決できないパスへの cd は安全側（検査対象に残す）' \
  'cd "$OTHER_REPO" && git commit -m "なにか"'

echo
echo '=== 分岐元をフラグと誤認しない ==='
run 0 'checkout -b <name> -q（分岐元は現在ブランチ = production）' \
  'git checkout -b docs/example -q'
run 2 'checkout -b <name> -q・現在ブランチが production でない' \
  'git checkout -b docs/example -q' feat/existing
refute '分岐元: -q' 'フラグを分岐元として報告しない'
run 0 'checkout -b <name> production' \
  'git checkout -b docs/example production' feat/existing
run 2 'checkout -b <name> -q release/1.0.0（分岐元は release）' \
  'git checkout -b docs/example -q release/1.0.0' feat/existing
run 0 'fix/* は release/* から切れる' \
  'git checkout -b fix/typo -q release/1.0.0' feat/existing

echo
echo '=== 既存の挙動（回帰） ==='
run 2 'ブランチ命名規則違反' 'git checkout -b wip'
run 2 'ブランチ名がケバブケースでない' 'git checkout -b feat/UserProfile'
run 0 'production へ切り替えてから分岐' \
  'git checkout production && git checkout -b feat/user-profile' feat/existing
run 0 'heredoc の本文は検査しない' \
  "cat <<'EOF' > memo.md
git commit -m 'これは例です'
EOF" feat/existing
run 2 'commit -m の heredoc は検査する' \
  "git commit -m \"\$(cat <<'EOF'
なにか
EOF
)\"" feat/existing
run 0 'git を含まないコマンド' 'echo hello'
run 0 'コミットメッセージ中の ; では分割しない' \
  "git commit -m 'feat: a; b を追加'" feat/existing

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

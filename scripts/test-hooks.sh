#!/bin/bash
set -u

# .claude/hooks/ の回帰テスト。
#
# サンドボックスに「セッションのリポジトリ」と「別リポジトリ」を作り、
# フックへ入力 JSON を直接流して終了コードを検証する。
# ブロックは exit 2、許可（ask を含む）は exit 0。
#
# 対象:
#   pre-git-guard.sh      PreToolUse(Bash)   git 操作の検証
#   post-edit-reminder.sh PostToolUse(Edit)  監視パスのリマインド
#   stop-dod-check.sh     Stop               DoD の自動実行
#   session-start-questions.sh  SessionStart   未回答の確認事項の抽出
#   stop-questions-reminder.sh  Stop           確認事項の提示忘れの検出
#
# node_modules に依存しないので yarn install なしで実行できる。
# 実体を package.json ではなくこのスクリプトに置いている理由は
# scripts/test-rules.sh と同じ（ルート package.json は Template Sync の対象外）。

cd "$(dirname "$0")/.."
REPO=$(pwd -P)
HOOK=$REPO/.claude/hooks/pre-git-guard.sh

# 構文が bash 3.2（macOS の /bin/sh）で通ることを先に見る。ここが壊れると
# フックが丸ごと動かず、Bash ツールの呼び出しが全て失敗する
for hook in "$REPO"/.claude/hooks/*.sh; do
  if ! sh -n "$hook" 2>/dev/null; then
    echo "構文エラー: $hook" >&2
    sh -n "$hook"
    exit 1
  fi
done

if command -v node >/dev/null 2>&1; then
  node "$REPO/scripts/check-shell-compat.mjs" || exit 1
else
  echo 'node が無いため bash 3.2 互換の検査をスキップします'
fi

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
git -C "$SESSION" branch feat/other
git -C "$SESSION" branch release/1.0.0
git -C "$SESSION" branch claude/session-abc123

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

# expect <部分文字列> <説明>: 直前の run の出力に現れるべき文字列。
# 許可と ask はどちらも exit 0 なので、区別するにはメッセージを見るしかない
expect() {
  case "$LAST_OUT" in
    *"$1"*)
      pass=$((pass + 1))
      printf 'ok   [+] %s\n' "$2"
      ;;
    *)
      fail=$((fail + 1))
      printf 'FAIL %s\n     out: %s\n' "$2" "$LAST_OUT"
      ;;
  esac
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
run 2 '束ねた短縮フラグ（-am）でも規約を検証する' \
  "git commit -am 'wip'" feat/existing
run 2 '束ねた短縮フラグ（-qm）でも規約を検証する' \
  "git commit -qm 'wip'" feat/existing
run 2 '束ねた短縮フラグに紛れた -n（-an）を止める' \
  "git commit -an -m 'feat: x'" feat/existing
run 2 '束ねた短縮フラグに紛れた -n（-nm）を止める' \
  "git commit -nm 'feat: x'" feat/existing
run 2 '-m に値が直付けされた形（-m"wip"）でも規約を検証する' \
  'git commit -m"wip"' feat/existing
run 0 '束ねた短縮フラグでも規約に沿っていれば通す' \
  "git commit -am 'feat: なにかを追加'" feat/existing
run 0 'コミットメッセージ中の -n を禁止フラグと誤認しない' \
  "git commit -m 'fix: -n の扱いを直す'" feat/existing
run 0 'git push -n（dry-run）は commit の -n 禁止に巻き込まない' \
  'git push -n origin feat/existing' feat/existing
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
echo '=== production への push は書き方を問わず止める ==='
run 2 'git push（引数なし）' 'git push'
run 2 'git push origin HEAD' 'git push origin HEAD'
run 2 'git push -u origin HEAD' 'git push -u origin HEAD'
run 2 'git push origin（リモートのみ）' 'git push origin'
run 2 'リダイレクトを区切りと誤認しない' 'git push 2>&1'
run 2 'refs/heads/production を明示' 'git push origin HEAD:refs/heads/production'
run 2 '他ブランチから production へ明示' \
  'git push origin feat/existing:refs/heads/production' feat/existing
run 0 'production 上でも別ブランチの push は通す' \
  'git push origin feat/existing'
run 2 'git push --all（refspec を書かずに全ブランチを更新する）' \
  'git push --all origin' feat/existing
run 2 'git push --mirror' 'git push --mirror origin' feat/existing
run 2 'クォート付きの push 先' 'git push origin "production"' feat/existing
run 2 'クォート付きの refspec' "git push origin 'HEAD:production'"
# git は heads/production も refs/heads/production に解決する（DWIM）
run 2 'refspec の短縮形 heads/production' 'git push origin heads/production'
run 2 'HEAD:heads/production' 'git push origin HEAD:heads/production'
# 先頭の + は force push そのもの。heads/ を剥がす前に外さないと一致しない
run 2 '+heads/production' 'git push origin +heads/production'
run 2 '+refs/heads/production' 'git push origin +refs/heads/production'
# + は force push そのものなので、release/* 宛ては ask ではなく deny になる
run 2 '+release/* への push は force push として止める' \
  'git push origin +heads/release/1.0.0' feat/existing
run 0 '作業ブランチからの push' 'git push -u origin feat/existing' feat/existing

echo
echo '=== hotfix/* への push も確認を求める（staging へデプロイされる） ==='
run 0 'hotfix/* への push は ask（deny ではない）' \
  'git push origin hotfix/1.0.1' feat/existing

echo
echo '=== 検査の迂回を止める ==='
run 2 '絶対パスの git（production 直コミット）' "/usr/bin/git commit -m 'feat: x'"
run 2 '絶対パスの git（規約外メッセージ）' \
  "/usr/bin/git commit -m 'なにか'" feat/existing
run 2 '-c core.hooksPath で husky を無効化' \
  "git -c core.hooksPath=/dev/null commit -m 'feat: x'" feat/existing
run 2 '-c core.hookspath（設定キーは大文字小文字を区別しない）' \
  "git -c core.hookspath=/dev/null commit -m 'feat: x'" feat/existing
run 0 'コミットメッセージ中の -c core.hooksPath を迂回と誤認しない' \
  "git commit -m 'docs: -c core.hooksPath について書く'" feat/existing
run 2 'HUSKY=0 の前置きで husky を無効化' \
  "HUSKY=0 git commit -m 'feat: x'" feat/existing
run 2 'env HUSKY=0 の形' \
  "env HUSKY=0 git commit -m 'feat: x'" feat/existing
run 2 'GIT_CONFIG_* で core.hooksPath を注入' \
  "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m 'feat: x'" \
  feat/existing
run 2 'GIT_CONFIG_PARAMETERS で core.hooksPath を注入' \
  "GIT_CONFIG_PARAMETERS=\"'core.hooksPath=/dev/null'\" git commit -m 'feat: x'" \
  feat/existing
run 2 '別セグメントでの export HUSKY=0' \
  "export HUSKY=0; git commit -m 'feat: x'" feat/existing
run 2 'git config core.hooksPath で husky を永続的に外す' \
  "git config core.hooksPath /dev/null; git commit -m 'feat: x'" feat/existing
run 2 'git config --local core.hooksPath' \
  "git config --local core.hooksPath /dev/null; git commit -m 'feat: x'" feat/existing
# 値を伴わない読み出しは設定を変えないので止めない
run 0 'git config core.hooksPath の読み出し' \
  "git config core.hooksPath" feat/existing
run 0 'git config --get core.hooksPath' \
  "git config --get core.hooksPath" feat/existing
run 0 'コミットメッセージ中の git config core.hooksPath を迂回と誤認しない' \
  "git commit -m 'docs: git config core.hooksPath の迂回を禁止する'" feat/existing
# 1 回限りの前置きは後続の git に効かない（CI で普通に使う形）
run 0 'HUSKY=0 yarn install は後続の git に影響しない' \
  'HUSKY=0 yarn install && git status' feat/existing
run 0 'コミットメッセージ中の HUSKY=0 を迂回と誤認しない' \
  "git commit -m 'docs: HUSKY=0 について書く'" feat/existing
# HUSKY= （空）は husky を無効化しない。継承した HUSKY=0 を打ち消す用途がある
run 0 'HUSKY=（空）は無効化ではないので止めない' \
  "HUSKY= git commit -m 'feat: x'" feat/existing
run 2 '--no-verif（長いオプションの前方一致）' \
  "git commit --no-verif -m 'feat: x'" feat/existing
# フラグをクォートで囲むと、短縮フラグの展開もメッセージの取り出しも一致せず、
# 規約の検証も迂回の検出も丸ごと飛んでいた
run 2 'クォート付きの -m でも規約を検証する' 'git commit "-m" "wip"' feat/existing
run 0 'クォート付きの -m でも規約どおりなら通す' \
  'git commit "-m" "feat: x"' feat/existing
run 2 "クォート付きの -m（シングルクォート）" \
  "git commit '-m' 'wip'" feat/existing
run 2 'クォート付きの束ねたフラグ（"-am"）も展開する' \
  'git commit "-am" "wip"' feat/existing
run 2 'クォート付きの --no-verify も迂回として止める' \
  'git commit "--no-verify" -m "feat: x"' feat/existing
run 0 'メッセージ中の "-m" をフラグと誤認しない' \
  "git commit -m 'docs: \"-m\" の使い方を書く'" feat/existing
run 2 '--mes（--message の前方一致）でも規約を検証する' \
  "git commit --mes 'wip'" feat/existing
run 2 '2 つ目の -m に規約どおりのメッセージを置いても通さない' \
  "git commit -m 'wip' -m 'feat: x'" feat/existing
run 0 '1 つ目の -m が規約どおりなら通す（2 つ目は本文）' \
  "git commit -m 'feat: x' -m 'wip'" feat/existing

# 複数行のメッセージはクォートの中に改行を持つ。絞り込みループがセグメントを
# 行単位で読み直すと 2 行目以降が丸ごと検査から落ちるため、終端の印で区切る
run 0 '複数行のメッセージ（ダブルクォート）' \
  'git commit -m "feat: なにかを追加

Co-Authored-By: someone <noreply@example.com>"' feat/existing
run 0 '複数行のメッセージ（シングルクォート）' \
  "git commit -m 'fix: なにかを直す

本文'" feat/existing
run 2 '複数行でも 1 行目が規約違反なら止める' \
  'git commit -m "wip

Co-Authored-By: someone <noreply@example.com>"' feat/existing
# sh -c / eval / バッククォートの中身は実際に実行される
run 2 'sh -c で包んだ production への push' \
  'sh -c "git push origin production"'
run 2 "bash -c（シングルクォート）" \
  "bash -c 'git push origin production'"
run 2 'eval で包んだ production への push' \
  'eval "git push origin production"'
run 2 'バッククォートの中の push' 'echo `git push origin production`'
run 2 'フラグを束ねた sh -cx' "sh -cx 'git push origin production'"
run 2 'パス付きのシェル（/bin/sh -c）' \
  '/bin/sh -c "git push origin production"'
# ANSI-C クォート（ドル記号 + 引用符）の \x20 を戻さないと 1 トークンのままになる
run 2 'ANSI-C クォートで空白をエスケープした形' \
  "sh -c \$'git\\x20push origin production'"
# 引用の中のエスケープされた引用符を閉じと誤読すると、その後ろの <<EOF を
# heredoc の開始と扱い、本文として除去した行が検査から落ちる
run 2 'エスケープされた引用符を含む行の <<EOF を heredoc と誤認しない' \
  'echo "see \" <<EOF"
git push origin production
EOF'
# 実際の git worktree add 以外の worktree トークンから走査しない
run 0 'git log --grep の引数の worktree add を作成と誤認しない' \
  'git log --grep worktree add ../foo-bar' feat/existing
run 2 'bash -lc' "bash -lc 'git push origin production'"
run 0 'コミットメッセージ中の sh -c / eval への言及は展開しない' \
  "git commit -m 'docs: eval \"git push origin production\" は禁止'" feat/existing

# 終端の無い heredoc はシェルでも構文エラー。heredoc と誤認すると、その行より
# 後ろのコマンドが丸ごと検査から落ちる
run 2 'クォート内の <<EOF を heredoc と誤認しない' \
  "echo 'see <<EOF docs'
git push origin production"
run 2 'コメント内の <<EOF を heredoc と誤認しない' \
  "# note <<EOF
git push origin production"

run 2 'here-string を heredoc と誤認しない' \
  "grep <<<'pattern' file
git commit -m 'wip'" feat/existing

echo
echo '=== ブランチ作成は checkout -b 以外の書き方も見る ==='
run 2 'git branch <名前> の命名規則違反' 'git branch not_kebab'
run 2 'git worktree add -b の命名規則違反' \
  'git worktree add -b bad_name ../wt'
run 0 'git branch <名前> でも規約に沿っていれば通す' 'git branch feat/new-thing'
run 0 'git branch -r --list はブランチ作成ではない' \
  "git branch -r --list 'origin/release/*'"
run 0 'git branch -D はブランチ作成ではない' 'git branch -D not_kebab'
run 0 'git branch（一覧）はブランチ作成ではない' 'git branch'
run 0 'git branch <名前> <分岐元> の分岐元を読む' \
  'git branch feat/new-thing production' feat/existing
# git branch は作成の意味を変えないフラグ（--track / -f / -q 等）を挟める。
# 挟まった形だけ命名・分岐元の検査が素通りしていた
run 2 'git branch --track の分岐元が release/*' \
  'git branch --track feat/foo origin/release/1.0.0'
run 2 'git branch -q の命名規則違反' 'git branch -q Foo'
run 2 'git branch --no-track の分岐元が release/*' \
  'git branch --no-track feat/foo release/1.0.0'
run 0 'git branch --track でも規約どおりなら通す' \
  'git branch --track feat/new-thing production' feat/existing
# -b の無い worktree add は basename(パス) の名前でブランチを作る
run 2 'worktree add <パス>（-b 無し）の命名規則違反' 'git worktree add ../foo-bar'
run 2 'チェーンの後ろにある worktree add も見る' \
  'git status && git worktree add ../foo-bar'
# git 2.19 以降 git branch -l は --create-reflog ではなく --list
run 0 'git branch -l はブランチ作成ではない' "git branch -l 'release/*'"
run 0 'worktree add <パス> <既存ブランチ> は作成ではない' \
  'git worktree add ../wt feat/existing'
run 2 'switch --create（長い形）の命名規則違反' 'git switch --create wip'
run 2 'checkout --orphan の命名規則違反' 'git checkout --orphan wip'
run 2 'worktree add <パス> -b（-b の前に非フラグ）の命名規則違反' \
  'git worktree add ../wt -b wip'
run 0 'switch --create でも規約に沿っていれば通す' 'git switch --create feat/new-thing'
# worktree add は <path> [<commit-ish>] の順。パスを分岐元と誤認しない
run 0 'worktree add -b <名前> <パス>（git のドキュメントの語順）' \
  'git worktree add -b feat/new-thing ../wt'
run 0 'worktree add <パス> -b <名前>' 'git worktree add ../wt -b feat/new-thing'
run 2 'worktree add の分岐元は パスの次のトークンで見る' \
  'git worktree add -b feat/new-thing ../wt release/1.0.0' feat/existing

# --orphan は親を持たないブランチを作るので、分岐元の検査が意味を持たない。
# 現在ブランチへのフォールバックに救われて production 上では通っていた
echo
echo '=== --orphan は書き方として禁じる ==='
run 2 'switch --orphan（命名規則を満たしていても止める）' \
  'git switch --orphan feat/new-thing'
run 2 'checkout --orphan（命名規則を満たしていても止める）' \
  'git checkout --orphan feat/new-thing'
run 0 'コミットメッセージ中の --orphan を誤検出しない' \
  "git commit -m 'docs: --orphan を禁じた理由を書く'" feat/existing

echo
echo '=== コミットメッセージのファイル指定 ==='
run 2 '空白を含むパスは 1 引数として扱う（読めないので止まる）' \
  'git commit -F "my file.txt"' feat/existing

echo
echo '=== 書き方の違いで取りこぼさない・誤検知しない ==='
run 2 'checkout -B も命名規則を見る' 'git checkout -B wip'
run 2 'checkout -q -b（フラグが間に入る）' 'git checkout -q -b wip'
run 0 'クォート付きのブランチ名' 'git checkout -b "feat/user-profile"'
run 0 '--message=<メッセージ>' 'git commit --message=feat:\ x' feat/existing
run 0 'fetch の production は force push の対象ではない' \
  'git fetch origin production && git push --force-with-lease origin feat/existing' \
  feat/existing

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
echo '=== 全体レビューで見つかった穴（回帰） ==='
# #234: --unset / --remove-section も husky を外す
run 2 'git config --unset core.hooksPath' 'git config --unset core.hooksPath' feat/existing
run 2 'git config --unset-all core.hooksPath' \
  'git config --unset-all core.hooksPath' feat/existing
run 2 'git config --remove-section core' 'git config --remove-section core' feat/existing
run 2 'サブコマンド形（git config unset）' \
  'git config unset core.hooksPath' feat/existing
run 2 'サブコマンド形（git config set）' \
  'git config set core.hooksPath /dev/null' feat/existing
run 0 '読み出し（git config core.hooksPath）は通す' \
  'git config core.hooksPath' feat/existing
run 0 '読み出し（git config get）は通す' 'git config get core.hooksPath' feat/existing

# #235: alias 経由の呼び出し
run 2 '-c alias で commit を呼ぶ' \
  "git -c alias.ci='commit --no-verify' ci -m 'feat: x'" feat/existing
run 2 '-c alias で push を呼ぶ' \
  "git -c alias.p='push origin production' p" feat/existing
run 2 'alias を永続化する' "git config alias.ci 'commit -n'" feat/existing

# #236: コマンド解析の穴
run 2 "クォート付きのサブコマンド（git 'commit'）" \
  "git 'commit' -n -m wip" feat/existing
run 2 'クォートが途中に入るサブコマンド（co"mmit"）' \
  'git co"mmit" -n -m wip' feat/existing
run 2 'バックスラッシュ付きのサブコマンド' 'git c\ommit -n -m wip' feat/existing
run 2 'サブコマンドが置換（判定不能）' 'git $(echo commit) -n -m wip' feat/existing
run 0 'git --version はサブコマンド無しでも通す' 'git --version' feat/existing
run 0 'xargs へ渡す形は ask（deny ではない）' \
  "printf 'commit' | xargs git" feat/existing
run 0 'パイプでシェルへ流す形は ask（deny ではない）' \
  "echo 'git commit -n -m wip' | sh" feat/existing
run 2 'パス付きシェルの heredoc も本文を検査する' \
  "/bin/sh <<'EOF'
git commit -n -m wip
EOF" feat/existing
run 2 '無クォートの heredoc 本文の置換は検査する' \
  "cat <<EOF > /dev/null
\$(git push origin production)
EOF" feat/existing
run 0 'クォート付き heredoc の本文はデータとして扱う' \
  "cat <<'EOF' > /tmp/example.md
git push origin production
EOF" feat/existing

# #237: refspec のグロブ・変数・--prune
run 2 'refspec のグロブ' "git push origin 'refs/heads/*:refs/heads/*'" feat/existing
run 2 'refspec のグロブ（プレフィックス）' \
  "git push origin 'refs/heads/prod*'" feat/existing
run 2 'refspec に変数' 'git push origin HEAD:$b' feat/existing
run 0 '--prune は ask（deny ではない）' \
  "git push --prune origin feat/existing" feat/existing

# #238: PR / Issue 本文に書いた git コマンドで止めない
run 0 'gh pr create の本文に push の例を書く' \
  "gh pr create --title 'feat: x' --body 'Never run git push origin production directly'" \
  feat/existing
run 0 'gh issue create の本文にブランチ作成の例を書く' \
  "gh issue create --title 'guard' --body 'repro: git checkout -b wip'" feat/existing

# #247: 標準入力で渡すメッセージ（heredoc）も件名を検証する
run 0 'git commit -F - の heredoc（規約どおり）' \
  "git commit -F - <<'EOF'
feat: x
EOF" feat/existing
run 2 'git commit -F - の heredoc（規約違反）' \
  "git commit -F - <<'EOF'
wip
EOF" feat/existing

# #284: 本文に書いたコマンド例（バッククォート付き）を実行として読まない。
# フックの修正を説明するコミットは必ずこの形になる
run 0 'commit -F - の本文のバッククォート内のコマンド例は通す' \
  "git commit -F - <<'EOF'
fix: x

- \`git commit -n\` が素通りしていた
EOF" feat/existing
run 0 'commit -m の本文のバッククォート内のコマンド例は通す' \
  "git commit -m \"\$(cat <<'EOF'
fix: x

- \`git commit -n\` が素通りしていた
EOF
)\"" feat/existing
run 0 '本文の行頭のバッククォートを置換で書いた git と読まない' \
  "git commit -F - <<'EOF'
fix: x

\`git commit -n\` は素通りしていた
EOF" feat/existing
run 0 'commit -F - の本文の \$( ) のコマンド例は通す' \
  "git commit -F - <<'EOF'
fix: x

- \$(git push production) を止めた
EOF" feat/existing
run 0 'commit -F - の本文は <<\EOF（バックスラッシュ引用）でも通す' \
  "git commit -F - <<\\EOF
fix: x

- \`git commit -n\` が素通りしていた
EOF" feat/existing
# メッセージ本文として扱うのは、その行が実際にメッセージを受け取るときだけ。
# 行のどこかに git commit があるだけで本文をデータ扱いすると、同じ行に書いた
# シェルの heredoc（実行される本文）が検査から丸ごと落ちる
run 2 'git commit と同じ行のシェル heredoc は実行本文として検査する' \
  "echo 'git commit'; sh <<'EOF'
git push origin production
EOF" feat/existing
# heredoc の受け手は `<<` の直前の区切りから後ろで決める。行のどこかに
# git commit -m があるだけでメッセージ扱いにすると、同じ行の eval へ渡る本文が
# 検査から落ちる（eval は中身を静的に読めないので確認を求める形になる）
run 0 'commit と同じ行の eval の heredoc 本文はメッセージ扱いしない' \
  "git commit -m 'fix: ok'; eval \"\$(cat <<'EOF'
git push origin production
EOF
)\"" feat/existing
expect 'permissionDecision' '中身を読めない eval は確認を求める'
run 2 'メッセージを受け取らない commit と同じ行の heredoc 本文も検査する' \
  "git commit --amend --no-edit; sh <<'EOF'
git push origin production
EOF" feat/existing
# 本文がデータになるのはマーカーを引用した heredoc だけ。無クォートなら
# シェルが展開・実行するので、今までどおり検査する
run 2 '無クォートの commit heredoc 本文の置換は検査する' \
  "git commit -F - <<EOF
fix: x

\$(git commit -n)
EOF" feat/existing

# 引用符付きの環境変数を前置きしてもコマンド語を取り違えない
run 2 '引用符に空白を含む環境変数を前置きしても git を検査する' \
  "FOO='a b' git commit -n -m wip" feat/existing
run 0 '同じ前置きで規約どおりのメッセージなら通す' \
  "FOO='a b' git commit -m 'feat: x'" feat/existing

# 先行する別の heredoc の本文を件名として検証しない
run 2 '先行する heredoc があっても commit 本文を検証する' \
  "cat <<'X' > /dev/null
feat: これは別の本文
X
git commit -F - <<'EOF'
wip
EOF" feat/existing

# #239: 破壊的変更の件名
run 0 'feat!: を許可する' "git commit -m 'feat!: breaking'" feat/existing
run 0 'feat(scope)!: を許可する' \
  "git commit -m 'feat(web)!: breaking scoped'" feat/existing

# #240: 分岐元の書き方とブランチの改名
run 0 'production 上で checkout -b <name> HEAD' 'git checkout -b feat/x HEAD'
run 0 'production 上で checkout -b <name> @' 'git checkout -b feat/x @'
run 0 'refs/remotes/origin/production を分岐元に書く' \
  'git checkout -b feat/x refs/remotes/origin/production' feat/existing
run 2 'branch -c の新しい名前も命名規則の対象' \
  'git branch -c feat/existing BAD' feat/existing
run 2 'branch -m の新しい名前も命名規則の対象' \
  'git branch -m BAD_NAME' feat/existing
run 0 'branch -m で規約どおりの名前へ改名する' \
  'git branch -m feat/renamed-branch' feat/existing

echo
echo '=== chore/ は許可する（バージョン上げ・依存更新の置き場） ==='
run 0 'chore/* を production から切る' 'git checkout -b chore/bump-prettier-config'
run 2 'chore/ もケバブケースを外れると弾く' 'git checkout -b chore/Bump_Config'

echo
echo '=== #243: 文章だけの規約を機械的に止める ==='
run 0 'PR のマージは ask' 'gh pr merge 12 --squash' feat/existing
expect 'マージは人が決める' 'PR のマージであることを伝える'
run 0 'gh pr create の本文に書いた gh pr merge は素通し' \
  "gh pr create --body 'マージは gh pr merge 12 --squash で行う'" feat/existing
refute 'permissionDecision' '本文中のコマンド例では確認を求めない'

run 0 'ローカルブランチの削除は ask' 'git branch -D feat/other' feat/existing
expect 'ブランチの削除' '削除であることを伝える'
run 0 'リモートブランチの削除（--delete）は ask' \
  'git push origin --delete feat/other' feat/existing
expect 'リモートのブランチ削除' 'リモート削除であることを伝える'
run 0 'リモートブランチの削除（:branch）は ask' \
  'git push origin :feat/other' feat/existing
expect 'リモートのブランチ削除' 'コロン形式でも検出する'
run 0 'ブランチの一覧は削除ではない' "git branch -r --list 'origin/release/*'" feat/existing
refute 'permissionDecision' '一覧では確認を求めない'

run 0 '作業ブランチへの force push は ask' \
  'git push --force origin feat/existing' feat/existing
expect '履歴の書き換え' 'force push であることを伝える'
run 2 'production への force push は deny のまま' \
  'git push --force origin production' feat/existing
run 0 '通常の push は素通し' 'git push -u origin feat/existing' feat/existing
refute 'permissionDecision' '通常の push では確認を求めない'

run 0 'feat/* 同士のマージは ask' 'git merge feat/other' feat/existing
expect 'feat/* 同士の取り込み' 'マージルール違反であることを伝える'
run 0 'feat/* から release/* のマージは素通し' \
  'git merge origin/release/1.0.0' feat/existing
refute 'permissionDecision' 'release/* の取り込みでは確認を求めない'
run 0 'production 上での feat/* マージは対象外' 'git merge feat/other'
refute 'permissionDecision' 'feat/* に居ないときは対象外'

run 2 'merge --no-verify は deny' 'git merge --no-verify feat/other' feat/existing
run 2 'rebase --no-verify は deny' 'git rebase --no-verify production' feat/existing

# 回帰(#270): merge の字面だけを見ていたため、同じ結果になる rebase / pull /
# cherry-pick と refs/heads/ 付きの指定が素通りしていた
run 0 'feat/* の rebase も ask' 'git rebase feat/other' feat/existing
expect 'feat/* 同士の取り込み' 'rebase もマージルール違反として扱う'
run 0 'feat/* の pull も ask' 'git pull origin feat/other' feat/existing
expect 'feat/* 同士の取り込み' 'pull もマージルール違反として扱う'
run 0 'feat/* の cherry-pick も ask' 'git cherry-pick feat/other' feat/existing
expect 'feat/* 同士の取り込み' 'cherry-pick もマージルール違反として扱う'
run 0 'refs/heads/ 付きの merge も ask' \
  'git merge refs/heads/feat/other' feat/existing
expect 'feat/* 同士の取り込み' 'refs/heads/ 接頭辞を剥がして比較する'
run 0 'release/* の rebase は素通し' \
  'git rebase origin/release/1.0.0' feat/existing
refute 'permissionDecision' 'release/* の取り込みでは確認を求めない（rebase）'
run 0 '引数の無い pull は素通し' 'git pull' feat/existing
refute 'permissionDecision' '自分のブランチの pull は対象外'
run 0 '自分のブランチの pull は素通し' \
  'git pull origin feat/existing' feat/existing
refute 'permissionDecision' 'リモートから自分のブランチを取り込むだけなら確認しない'
run 0 '自分のブランチの rebase も素通し' \
  'git rebase origin/feat/existing' feat/existing
refute 'permissionDecision' 'rebase でも自分のブランチは対象外'
# 回帰(#285 レビュー): -- は引数の区切りであって走査の終わりではない
run 0 '-- の後ろの取り込み元も見る' 'git merge -- feat/other' feat/existing
expect 'feat/* 同士の取り込み' '-- の後ろでもマージルール違反として扱う'

echo
echo '=== #269: 予約語・ラッパー語の後ろの git も検査する ==='
# セグメント先頭のトークンだけを見ていたため、実行を包む語や複合コマンドの
# 予約語を挟むだけで --no-verify 禁止・メッセージ規約・直接コミット禁止が外れた
run 2 'command 経由でも検査する' 'command git commit -n -m wip' feat/existing
run 2 '波括弧の中でも検査する' '{ git commit -n -m wip; }' feat/existing
run 2 'if / then の後ろでも検査する' \
  'if true; then git commit -n -m wip; fi' feat/existing
run 2 'while / do の後ろでも検査する' \
  'while false; do git commit -n -m wip; done' feat/existing
run 2 'exec 経由でも検査する' 'exec git commit -n -m wip' feat/existing
run 2 'time 経由でも検査する' 'time git commit -n -m wip' feat/existing
run 2 '否定（!）の後ろでも検査する' '! git commit -n -m wip' feat/existing
run 2 'nohup 経由でも検査する' 'nohup git commit -n -m wip' feat/existing
run 2 '変数で書いた git は判定不能として deny' \
  'g=git; $g commit -n -m wip' feat/existing
expect '検査できない' '判定不能であることを伝える'
run 2 'コマンド置換で書いた git も deny' \
  '"$(which git)" commit -n -m wip' feat/existing
run 2 'バッククォートで書いた git も deny' \
  '`which git` commit -n -m wip' feat/existing
expect '検査できない' 'バッククォートのコマンド位置も判定不能として扱う'
run 0 'コマンド例の引用は素通し' \
  'echo "command git commit -n -m wip"' feat/existing
run 0 '包む語があっても規約どおりなら通す' \
  'command git commit -m "feat: x"' feat/existing
# 置換というだけで止めない（git と無関係なコマンドを巻き込まない）
run 0 '置換で書いた git 以外のコマンドは素通し' \
  '$NODE scripts/x.mjs && git status' feat/existing
run 0 '引数の位置の置換は対象外' 'echo $(date) && git status' feat/existing
run 0 'バッククォートでも git 以外なら素通し' \
  '`which node` script.js && git status' feat/existing

# 回帰(#285 レビュー): ラッパーが取るオプションを読み飛ばさないと、
# ラッパー名の直後のフラグがコマンド名として確定して検査が外れる
run 2 'sudo のオプション付きでも検査する' \
  'sudo -u root git commit -n -m wip' feat/existing
run 2 'command のオプション付きでも検査する' \
  'command -p git commit -n -m wip' feat/existing
run 2 'time のオプション付きでも検査する' \
  'time -p git commit -n -m wip' feat/existing
run 2 'time の値付きオプションでも検査する' \
  'time -o /tmp/t git commit -n -m wip' feat/existing
run 2 'exec の値付きオプションでも検査する' \
  'exec -a foo git commit -n -m wip' feat/existing
run 0 'ラッパー経由でも git でなければ素通し' \
  'sudo -u root apt update && git status' feat/existing

# 回帰(#285 レビュー): ダブルクォートの中でも $( … ) とバッククォートは
# シェルが評価する。区切らないと中身が外側のコマンドの一部として素通りする
run 2 'ダブルクォート内のコマンド置換も検査する' \
  'echo "$(git commit -n -m wip)"' feat/existing
run 2 'ダブルクォート内のバッククォートも検査する' \
  'echo "`git commit -n -m wip`"' feat/existing
# シングルクォートの中はシェルが評価しないので、今までどおり素通し
run 0 'シングルクォート内の置換は素通し' \
  "echo '\$(git commit -n -m wip)'" feat/existing
run 0 'git を含まない置換は切り出さない' 'echo "$(date)"' feat/existing

echo
echo '=== #268: 同じコマンド内のブランチ切り替えを判定に使う ==='
# フック実行時の HEAD だけで判定していたため、CLAUDE.md が勧める手順を
# 1 コマンドで書くと production 上で「直接コミット」と誤判定していた
run 0 'checkout -b した先でのコミットは通す' \
  'git checkout -b feat/new-thing && git commit --allow-empty -m "feat: x"'
run 0 'switch -c でも同じ' \
  'git switch -c feat/new-thing && git commit --allow-empty -m "feat: x"'
run 0 '既存ブランチへ checkout してからのコミットも通す' \
  'git checkout feat/existing && git commit --allow-empty -m "feat: x"'
run 2 'ブランチを切らないコミットは deny のまま' \
  'git commit --allow-empty -m "feat: x"'
expect 'production への直接コミット' 'production 上の直接コミットは止める'
run 2 'checkout がパスならブランチ切り替えとみなさない' \
  'git checkout src/app.ts && git commit --allow-empty -m "feat: x"'
run 2 '切り替え先が release/* ならコミットは deny' \
  'git checkout release/1.0.0 && git commit --allow-empty -m "feat: x"'
expect 'release/* への直接コミット' 'release/* への直接コミットも止める'
run 2 'ブランチを切っても規約違反のメッセージは deny' \
  'git checkout -b feat/new-thing && git commit --allow-empty -m "wip"'
# && 以外の区切りでは、checkout が失敗しても commit が走る。
# 切り替えの成功を前提にできないので実行時の HEAD で判定する
run 2 'セミコロン区切りでは切り替えを前提にしない' \
  'git checkout -b feat/new-thing ; git commit --allow-empty -m "feat: x"'
expect 'production への直接コミット' '; の後ろは production 上のコミットとして扱う'
run 2 '|| 区切りでも前提にしない' \
  'git checkout -b feat/new-thing || git commit --allow-empty -m "feat: x"'
# 回帰(#285 レビュー): 最初の commit で打ち切ると、後半の切り替え先が
# production でも通ってしまう。commit ごとに行き先を評価する
run 2 '2 つ目の commit が production へ戻るなら deny' \
  'git checkout -b feat/new-thing && git commit --allow-empty -m "feat: x" && git checkout production && git commit --allow-empty -m "feat: y"'
expect 'production への直接コミット' '後半のコミット先も見る'
run 0 '同じブランチへの複数コミットは通す' \
  'git checkout -b feat/new-thing && git commit --allow-empty -m "feat: x" && git commit --allow-empty -m "feat: y"'

# 回帰(#268): refspec 0 個を一律「現在ブランチへの push」と解釈していたため、
# production 上でのタグ push がブランチへの直接 push としてブロックされていた
run 0 'production 上でもタグだけの push は通す' 'git push origin --tags'
refute 'production への直接 push' 'タグの push はブランチ更新と見なさない'
run 2 '--tags でも refspec に production があれば deny' \
  'git push origin --tags production'
run 2 'refspec の無い push は deny のまま' 'git push origin'
# タグの force push はリモートのタグを別のコミットへ動かす（履歴の書き換え）
run 0 'タグの force push は ask' 'git push --force --tags origin' feat/existing
expect 'タグの force push' 'タグの付け替えであることを伝える'
run 0 'force の無いタグ push は素通し' 'git push --tags origin' feat/existing
refute 'permissionDecision' '通常のタグ push では確認を求めない'

echo
echo '=== #245: claude/* の免除はハーネスのセッション内だけ ==='
run 2 'production から claude/* は切れない' \
  'git checkout -b claude/whatever' 
run 2 'claude/ を付けても命名・分岐元の検査は外せない' \
  'git checkout -b claude/Whatever_Name feat/existing' feat/existing
run 0 'claude/* セッション内なら名前の形式を問わない' \
  'git checkout -b claude/Whatever_Name' claude/session-abc123
run 0 'claude/* セッション内でセッションブランチを切り直せる' \
  'git checkout -B claude/session-abc123 production' claude/session-abc123
run 2 'claude/* セッション内でも feat/* からは切れない' \
  'git checkout -b claude/other feat/existing' claude/session-abc123

echo
echo '=== レビュー指摘の回帰（#265） ==='
# 複数 refspec のとき、最初に当たった判定で確定すると
# `git push --force origin feat/x production` が production の deny に届かない
run 2 '複数 refspec は最も重い判定を採る（作業ブランチが先）' \
  'git push --force origin feat/existing production' feat/existing
run 2 '複数 refspec は最も重い判定を採る（production が先）' \
  'git push --force origin production feat/existing' feat/existing

# git の標準形 +<src>:<dst> では + が送信元側に付く。: で割ってから見ていると
# force と判定できず、release/* への強制 push が通常 push の ask になる
run 2 '+HEAD:release/* は force push として deny' \
  'git push origin +HEAD:release/1.0.0' feat/existing
run 0 '+HEAD:feat/* は force push の ask' \
  'git push origin +HEAD:feat/existing' feat/existing
expect '履歴の書き換え' '送信元側の + でも force として扱う'

# gh の検査は展開後のコマンドを見る。raw のまま正規表現で見ると
# heredoc 本文に誤反応し、sh -c 越しは見逃す
run 0 'sh -c 越しの gh pr merge も ask' "sh -c 'gh pr merge 12'" feat/existing
expect 'マージは人が決める' '展開してから判定する'
run 0 'gh -R owner/repo pr merge も ask' \
  'gh -R geckou/project-starter pr merge 12' feat/existing
expect 'マージは人が決める' 'グローバルフラグを挟んでも検出する'
run 0 'heredoc 本文の gh pr merge は素通し' \
  "cat <<'EOF' > memo.md
gh pr merge 12 --squash
EOF" feat/existing
refute 'permissionDecision' 'データとして書いた行では確認を求めない'
run 0 'gh pr create の本文（複数行）も素通し' \
  "gh pr create --body '手順:
gh pr merge 12 --squash
以上'" feat/existing
refute 'permissionDecision' '複数行の --body でも誤検知しない'

# 複製（-c / -C）は指定したブランチの先端に新しいブランチを作る＝分岐そのもの。
# 改名（-m / -M）と同じ「分岐元なし」扱いにすると、分岐元の検査を迂回できる
run 2 'branch -C で claude/* の分岐元検査を迂回できない' \
  'git branch -C feat/existing claude/new' claude/session-abc123
run 2 'branch -C の分岐元も production 縛り' \
  'git branch -C feat/existing feat/copied' feat/existing
run 0 'branch -C を production から切るのは通す' \
  'git branch -C production feat/copied'
run 0 'branch -M（改名）は分岐元を持たないので従来どおり' \
  'git branch -M feat/existing feat/renamed' feat/existing

echo
echo '=== 既存の挙動（回帰） ==='
run 2 'ブランチ命名規則違反' 'git checkout -b wip'
run 2 '許可リストに無いプレフィックス' 'git checkout -b feature/user-profile'
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
# 一律拒否になっていないこと。セグメントを行単位で読み直すと本文がどこにも
# 残らず、規約どおりのメッセージでも必ず弾かれていた
run 0 'commit -m の heredoc は規約どおりなら通す' \
  "git commit -m \"\$(cat <<'EOF'
feat: なにかを追加
EOF
)\"" feat/existing
run 0 'heredoc の 2 行目以降を別のコマンドと誤認しない' \
  "git commit -m \"\$(cat <<'EOF'
feat: なにかを追加

git -C /tmp status
EOF
)\"" feat/existing
# 本文の `git -C <別リポジトリ>` を実行ディレクトリの指定と取ると、
# コミットそのものが検査対象から外れる
run 2 'heredoc の本文の git -C で検査対象から外れない' \
  "git commit -m \"\$(cat <<'EOF'
wip

git -C /tmp status
EOF
)\"" feat/existing

# 迂回・push 先・ブランチ名の検出はコマンドのトークンだけを見る。メッセージの
# 値まで見ると、禁止事項を説明するコミットメッセージが書けなくなる
run 0 'メッセージ中の --no-verify を迂回と誤認しない' \
  "git commit -m 'docs: --no-verify を禁じた理由を書く'" feat/existing
run 0 '複数行のメッセージの本文でも誤認しない（--no-verify）' \
  'git commit -m "docs: フックの説明を書く

--no-verify は禁止と書いた"' feat/existing
run 0 '複数行のメッセージの本文でも誤認しない（push 先）' \
  'git commit -m "docs: 手順を書く

git push origin production は禁止"' feat/existing
run 0 '複数行のメッセージの本文でも誤認しない（ブランチ名）' \
  'git commit -m "docs: 手順を書く

git checkout -b wip は弾かれる"' feat/existing
run 0 '複数行のメッセージの本文でも誤認しない（HUSKY=0）' \
  'git commit -m "docs: 迂回の話を書く

HUSKY=0 は禁止"' feat/existing
# switch / checkout の -m は --merge。メッセージのフラグと同一視して次のトークンを
# 落とすと、-c <ブランチ名> が検出から消える
run 2 'switch -m -c（-m は --merge）でもブランチ名を見る' \
  'git switch -m -c wip'
run 2 'checkout --merge -b でもブランチ名を見る' \
  'git checkout --merge -b wip'

# メッセージの値を落とす処理が壊れると、後続のコマンドが丸ごと検査から消える。
# 落とし方を間違えやすい形を押さえる
run 2 'メッセージ中の \" で後続のコマンドを隠せない' \
  'git commit -m "fix: エラー \"undefined\"" && git push origin production' feat/existing
run 0 'メッセージ中の \" 単体は通す' \
  'git commit -m "fix: エラー \"undefined\""' feat/existing
run 2 '値の無い -m は次のセグメントの git を食べない' \
  "git commit -m 'feat: x' -m ; git push origin production" feat/existing
run 2 'refspec の commit をサブコマンドと誤認しない' \
  "git push origin commit -m ; git commit -m 'wip'"
# `--` より後ろはパススペック。フラグとして 1 文字ずつに展開すると
# -File.txt が -F（--file）や -n（検証スキップ）の指定に化ける
run 0 '-- より後ろのパススペックをフラグと読まない' \
  "git commit -m 'feat: x' -- '-File.txt'" feat/existing
run 0 '2 つ目の -m の値をフラグと読まない' \
  "git commit -m 'feat: x' -m '-n'" feat/existing

# クォート付きのフラグは、サブコマンドより前のグローバルオプションでも見落とす。
# 剥がさないと `git <サブコマンド>` の形に一致せず、検査そのものが飛ぶ
run 2 'クォート付きの -c core.hooksPath も迂回として止める' \
  'git "-c" core.hooksPath=/dev/null commit -m "feat: x"' feat/existing
run 2 'クォート付きのグローバルオプションでも commit の検査を飛ばさない' \
  'git "--no-pager" commit -m "wip"'

# シェルは \-m と -m を同じフラグとして渡す。クォートだけを剥がしていると
# バックスラッシュで書いた形が素通りする
run 2 'バックスラッシュ付きの -m でも規約を検証する' 'git commit \-m "wip"' feat/existing
run 0 'バックスラッシュ付きの -m でも規約どおりなら通す' \
  'git commit \-m "feat: x"' feat/existing
run 2 'バックスラッシュ付きの --no-verify も迂回として止める' \
  'git commit --no\-verify -m "feat: x"' feat/existing
run 2 'バックスラッシュ付きの -c core.hooksPath も止める' \
  'git \-c core.hooksPath=/dev/null commit -m "feat: x"' feat/existing

# heredoc は件名（最初の非空行）だけを見る。どの行でもよいことにすると、
# 件名が規約違反でも本文に type らしい行を置くだけで通ってしまう
run 2 'heredoc の件名が規約違反なら、本文に type があっても止める' \
  "git commit -m \"\$(cat <<'EOF'
wip

feat: あとから規約どおりの行を置く
EOF
)\"" feat/existing
run 0 'heredoc は件名さえ規約どおりなら本文は自由' \
  "git commit -m \"\$(cat <<'EOF'
feat: なにかを追加

本文に wip と書く
EOF
)\"" feat/existing

# 行末のバックスラッシュは行の継続。文字として残すと、次の行のメッセージが
# 値ではなく別のトークンとして読まれる
run 0 'バックスラッシュ継続の次の行にメッセージ' \
  'git commit -m \
  "feat: x"' feat/existing
run 2 'バックスラッシュ継続でも規約違反は止める' \
  'git commit -m \
  "wip"' feat/existing
run 0 'git を含まないコマンド' 'echo hello'
run 0 'コミットメッセージ中の ; では分割しない' \
  "git commit -m 'feat: a; b を追加'" feat/existing

# ---- post-edit-reminder.sh / stop-dod-check.sh ----
#
# この2つは config.sh からスタック依存の値を読む。設定が効くことと、
# config.sh が無くても既定値で動くこと（`.claude/docs/hooks.md`「スタック依存の値は
# config.sh に置く」）の両方を検証する。

EDIT_HOOK=$REPO/.claude/hooks/post-edit-reminder.sh
DOD_HOOK=$REPO/.claude/hooks/stop-dod-check.sh

# config.sh を読めない状態を再現するため、フック本体だけを別ディレクトリへ複製する
NOCONFIG=$SANDBOX/hooks-noconfig
mkdir -p "$NOCONFIG"
cp "$EDIT_HOOK" "$DOD_HOOK" "$NOCONFIG/"

# タスクの成否を制御できる偽のランナー。lint だけ失敗する。
# run サブコマンド経由で呼ばれることも検証する（npm はこれが無いと動かない）
mkdir -p "$SANDBOX/bin"
cat > "$SANDBOX/bin/fakerunner" <<'RUNNER'
#!/bin/sh
[ "$1" = run ] || { echo "run サブコマンドが渡されていない: $*"; exit 1; }
[ "$2" = lint ] && { echo "lint error"; exit 1; }
exit 0
RUNNER
chmod +x "$SANDBOX/bin/fakerunner"
# set -u のため、PATH が未定義でも落ちない形で追記する
PATH=$SANDBOX/bin:${PATH:-}

# run_edit <期待する終了コード> <説明> <file_path> [フック本体のパス]
run_edit() {
  want=$1
  desc=$2
  file=$3
  hook=${4:-$EDIT_HOOK}

  LAST_OUT=$(jq -n --arg f "$file" '{tool_input:{file_path:$f}}' | sh "$hook" 2>&1)
  status=$?

  if [ "$status" = "$want" ]; then
    pass=$((pass + 1))
    printf 'ok   [%s] %s\n' "$status" "$desc"
  else
    fail=$((fail + 1))
    printf 'FAIL [want %s got %s] %s\n     file: %s\n     out: %s\n' \
      "$want" "$status" "$desc" "$file" "$LAST_OUT"
  fi
}

# run_dod <期待する終了コード> <説明> <入力 JSON> [フック本体のパス]
# セッションのリポジトリで実行する（git status の結果を見るため）
run_dod() {
  want=$1
  desc=$2
  input=$3
  hook=${4:-$DOD_HOOK}

  LAST_OUT=$(cd "$SESSION" && printf '%s' "$input" | sh "$hook" 2>&1)
  status=$?

  if [ "$status" = "$want" ]; then
    pass=$((pass + 1))
    printf 'ok   [%s] %s\n' "$status" "$desc"
  else
    fail=$((fail + 1))
    printf 'FAIL [want %s got %s] %s\n     out: %s\n' \
      "$want" "$status" "$desc" "$LAST_OUT"
  fi
}

echo
echo '=== post-edit-reminder: 監視パスの判定 ==='
run_edit 2 '監視ファイル（リポジトリ相対パス）' 'firestore.rules'
run_edit 2 '監視ファイル（絶対パス）' "$REPO/firestore.rules"
run_edit 2 '監視ディレクトリの配下' 'packages/shared/src/index.ts'
run_edit 2 '監視ディレクトリの配下（絶対パス）' "$REPO/packages/shared/src/index.ts"
run_edit 0 '監視対象外のファイル' 'apps/web/src/app/page.tsx'
run_edit 0 'file_path が無い入力' ''
run_edit 0 '監視ファイル名を含むだけの別ファイル' 'docs/firestore.rules.md'

echo
echo '=== post-edit-reminder: 設定で監視パスを差し替えられる ==='
HOOK_WATCH_PATHS=$(printf 'db/schema.sql\tスキーマを変更した')
export HOOK_WATCH_PATHS
run_edit 2 '差し替えた監視パスにマッチする' 'db/schema.sql'
run_edit 0 '既定の監視パスは効かなくなる' 'firestore.rules'
unset HOOK_WATCH_PATHS

echo
echo '=== post-edit-reminder: config.sh が無くても既定値で動く ==='
run_edit 2 '既定の監視ファイル' 'firestore.rules' "$NOCONFIG/post-edit-reminder.sh"
run_edit 0 '既定でも対象外は素通り' 'apps/web/src/app/page.tsx' \
  "$NOCONFIG/post-edit-reminder.sh"

echo
echo '=== stop-dod-check: 実行条件 ==='
HOOK_RUNNER=fakerunner
export HOOK_RUNNER
run_dod 0 'フック起因の継続中は再度ブロックしない' '{"stop_hook_active":true}'
run_dod 0 'コードの未コミット変更が無ければ走らせない' '{}'

# コードファイルの未コミット変更を作る
echo 'export const x = 1' > "$SESSION/probe.ts"

run_dod 2 'コード変更があり DoD が失敗したらブロックする' '{}'
HOOK_DOD_TASKS='type-check'
export HOOK_DOD_TASKS
run_dod 0 '成功するタスクだけなら通す' '{}'
unset HOOK_DOD_TASKS
HOOK_CODE_EXTENSIONS='rules'
export HOOK_CODE_EXTENSIONS
run_dod 0 '対象拡張子から外れていれば走らせない' '{}'
unset HOOK_CODE_EXTENSIONS
run_dod 0 'stop_hook_active はコード変更があっても優先される' '{"stop_hook_active":true}'

# 回帰(#241): git status --porcelain は未追跡ディレクトリを 1 行にまとめるため、
# 新しいディレクトリを丸ごと追加した作業で DoD が走らなかった
rm -f "$SESSION/probe.ts"
mkdir -p "$SESSION/newdir"
echo 'export const y = 1' > "$SESSION/newdir/a.ts"
HOOK_DOD_TASKS='lint'
export HOOK_DOD_TASKS
run_dod 2 '新規ディレクトリ配下のコードでも DoD が走る' '{}'
unset HOOK_DOD_TASKS
rm -rf "$SESSION/newdir"

# 回帰(#271): git status --porcelain は空白を含むパスを `?? "my file.ts"` と
# クォートするため、末尾が `"` になって拡張子の判定に当たらなかった
echo 'export const z = 1' > "$SESSION/my file.ts"
HOOK_DOD_TASKS='lint'
export HOOK_DOD_TASKS
run_dod 2 '空白入りのファイル名でも DoD が走る' '{}'
unset HOOK_DOD_TASKS
rm -f "$SESSION/my file.ts"

echo 'export const x = 1' > "$SESSION/probe.ts"

echo
echo '=== stop-dod-check: config.sh が無くても既定値で動く ==='
# 既定のランナー（yarn）が無い環境では何もせず終了する
run_dod 0 '既定値でも入力の判定は変わらない' '{"stop_hook_active":true}' \
  "$NOCONFIG/stop-dod-check.sh"

rm -f "$SESSION/probe.ts"
unset HOOK_RUNNER

# ---- session-start-questions.sh / stop-questions-reminder.sh ----
#
# 確認事項キュー（CLAUDE.md「自律性の境界」）を読む2つのフック。
# SessionStart 側は文脈への出力が成果物なので、終了コードではなく出力を検証する。

Q_START_HOOK=$REPO/.claude/hooks/session-start-questions.sh
Q_STOP_HOOK=$REPO/.claude/hooks/stop-questions-reminder.sh
cp "$Q_START_HOOK" "$Q_STOP_HOOK" "$NOCONFIG/"

QUESTIONS=$SESSION/.claude/docs/questions.md
mkdir -p "$SESSION/.claude/docs"

# write_questions <未回答セクションの中身>
write_questions() {
  {
    printf '# 確認事項キュー\n\n## 未回答\n\n'
    printf '%s\n' "$1"
    printf '\n## 回答済み\n\n### Q-000 回答済みの問い\n\n- 回答: 済\n'
  } > "$QUESTIONS"
}

# run_qstart <期待する出力の部分文字列|EMPTY> <説明> [フック本体のパス]
run_qstart() {
  want=$1
  desc=$2
  hook=${3:-$Q_START_HOOK}

  LAST_OUT=$(cd "$SESSION" && sh "$hook" 2>&1)

  ok=0
  if [ "$want" = EMPTY ]; then
    [ -z "$LAST_OUT" ] && ok=1
  else
    case "$LAST_OUT" in *"$want"*) ok=1 ;; esac
  fi

  if [ "$ok" = 1 ]; then
    pass=$((pass + 1))
    printf 'ok   [-] %s\n' "$desc"
  else
    fail=$((fail + 1))
    printf 'FAIL %s\n     want: %s\n     out: %s\n' "$desc" "$want" "$LAST_OUT"
  fi
}

# run_qstop <期待する終了コード> <説明> <入力 JSON> [フック本体のパス]
run_qstop() {
  want=$1
  desc=$2
  input=$3
  hook=${4:-$Q_STOP_HOOK}

  LAST_OUT=$(cd "$SESSION" && printf '%s' "$input" | sh "$hook" 2>&1)
  status=$?

  if [ "$status" = "$want" ]; then
    pass=$((pass + 1))
    printf 'ok   [%s] %s\n' "$status" "$desc"
  else
    fail=$((fail + 1))
    printf 'FAIL [want %s got %s] %s\n     out: %s\n' "$want" "$status" "$desc" "$LAST_OUT"
  fi
}

echo
echo '=== session-start-questions: 未回答の抽出 ==='
run_qstart EMPTY '確認事項ファイルが無ければ何も出さない'
write_questions '（なし）'
run_qstart EMPTY '未回答が無ければ何も出さない'
write_questions '### Q-001 予約のキャンセル期限

- ブロック: 予約キャンセル API

### Q-002 通知の文言'
run_qstart '未回答の確認事項（2 件）' '未回答の件数を出す'
run_qstart 'Q-001 予約のキャンセル期限' '未回答の見出しを出す'
refute 'Q-000' '「回答済み」の見出しは拾わない'

# 回帰(#232): questions.md は記入例を HTML コメントで持っている。コメントを
# 読み飛ばさないと、キューが空の初期状態でも毎回「未回答 1 件」を出していた
echo
echo '=== session-start-questions: HTML コメントの中は拾わない ==='
{
  printf '# 確認事項キュー\n\n## 未回答\n\n'
  printf '<!--\n以下のテンプレートで追記する。\n\n### Q-001 一行で書いた問い\n\n- 発生: いつ / どの作業中か\n-->\n\n'
  printf '（なし）\n\n## 回答済み\n\n<!--\n### Q-000 問い\n-->\n\n（なし）\n'
} > "$QUESTIONS"
run_qstart EMPTY '記入例だけの初期状態では何も出さない'

{
  printf '# 確認事項キュー\n\n## 未回答\n\n'
  printf '<!--\n### Q-001 一行で書いた問い\n-->\n\n'
  printf '### Q-010 実際に積んだ問い\n\n- ブロック: 予約キャンセル API\n'
} > "$QUESTIONS"
run_qstart '未回答の確認事項（1 件）' 'コメントの外の見出しだけを数える'
run_qstart 'Q-010 実際に積んだ問い' '実際に積んだ見出しは出す'
refute 'Q-001' '記入例の見出しは出さない'

# 1 行で閉じるコメントでコメント判定が開きっぱなしにならないこと
{
  printf '# 確認事項キュー\n\n## 未回答\n\n'
  printf '<!-- 1 行で閉じる注記 -->\n\n'
  printf '### Q-011 注記の後の問い\n'
} > "$QUESTIONS"
run_qstart 'Q-011 注記の後の問い' '1 行で閉じるコメントの後の見出しは拾う'

echo
echo '=== session-start-questions: 設定で場所を差し替えられる ==='
write_questions '### Q-001 予約のキャンセル期限

- ブロック: 予約キャンセル API

### Q-002 通知の文言'
printf '# q\n\n## 未回答\n\n### Q-900 差し替え先の問い\n' > "$SESSION/other-questions.md"
HOOK_QUESTIONS_FILE=other-questions.md
export HOOK_QUESTIONS_FILE
run_qstart 'Q-900 差し替え先の問い' '差し替えたファイルを読む'
refute 'Q-001' '既定のファイルは読まなくなる'
unset HOOK_QUESTIONS_FILE

echo
echo '=== session-start-questions: config.sh が無くても既定値で動く ==='
run_qstart 'Q-001 予約のキャンセル期限' '既定のパスを読む' \
  "$NOCONFIG/session-start-questions.sh"

echo
echo '=== stop-questions-reminder: 提示忘れの検出 ==='
run_qstop 2 '未追跡の確認事項ファイルがあればブロックする' '{}'
run_qstop 0 'フック起因の継続中は再度ブロックしない（session_id 無し）' \
  '{"stop_hook_active":true}'
run_qstop 2 'DoD が先にブロックした継続でも判定は走る' \
  '{"stop_hook_active":true,"session_id":"s-questions"}'
run_qstop 0 '同じセッションで 2 回目はブロックしない（無限ループ防止）' \
  '{"stop_hook_active":true,"session_id":"s-questions"}'
rm -f "${TMPDIR:-/tmp}/claude-stop-questions-s-questions"

git -C "$SESSION" add .claude/docs/questions.md
git -C "$SESSION" -c user.email=test@example.com -c user.name=test \
  commit -q -m 'docs: 確認事項'
run_qstop 0 'コミット済みで変更が無ければ何も言わない' '{}'

write_questions '### Q-001 予約のキャンセル期限

- ブロック: 予約キャンセル API

### Q-002 通知の文言

### Q-003 追加の問い'
run_qstop 2 'この作業で確認事項が増えていればブロックする' '{}'
git -C "$SESSION" checkout -q -- .claude/docs/questions.md

# 判定は「未回答が増えたか」であって「ファイルが dirty か」ではない。
# /questions が回答済みへ移した直後にブロックしてしまうのを防ぐ
echo
echo '=== stop-questions-reminder: 回答側の更新ではブロックしない ==='
write_questions '### Q-001 予約のキャンセル期限

- ブロック: 予約キャンセル API'
run_qstop 0 '未回答が減った（回答済みへ移した）ときはブロックしない' '{}'
write_questions '（なし）'
run_qstop 0 '未回答が空になったときはブロックしない' '{}'
write_questions '### Q-001 予約のキャンセル期限

- ブロック: 予約キャンセル API（追記）

### Q-002 通知の文言'
run_qstop 0 '見出しが同じなら本文を直してもブロックしない' '{}'

# 回帰(#232): 抽出は session-start-questions.sh と同じもの。コメントを読み飛ばさないと、
# 記入例を書き足しただけで「確認事項が増えた」と誤判定してブロックする
echo
echo '=== stop-questions-reminder: HTML コメントの中は数えない ==='
{
  printf '# 確認事項キュー\n\n## 未回答\n\n'
  printf '<!--\n### Q-999 記入例の問い\n-->\n\n'
  printf '### Q-001 予約のキャンセル期限\n\n- ブロック: 予約キャンセル API\n\n'
  printf '### Q-002 通知の文言\n\n## 回答済み\n\n### Q-000 回答済みの問い\n\n- 回答: 済\n'
} > "$QUESTIONS"
run_qstop 0 '記入例を書き足しただけではブロックしない' '{}'

git -C "$SESSION" checkout -q -- .claude/docs/questions.md

# 回帰(#244): 絶対パスを渡されると git show "HEAD:/abs/..." が必ず失敗し、
# 比較対象が空になって、未回答が 1 件でもあれば毎回ブロックしていた
echo
echo '=== stop-questions-reminder: 絶対パスの設定でも比較できる ==='
HOOK_QUESTIONS_FILE="$SESSION/.claude/docs/questions.md"
export HOOK_QUESTIONS_FILE
run_qstop 0 'HEAD と同じ内容なら絶対パスでもブロックしない' '{}'
unset HOOK_QUESTIONS_FILE

rm -f "$SESSION/other-questions.md"

# ---- post-git-branch-reminder.sh ----
#
# pre-git-guard.sh と正規表現を共有しているので、片方だけ直すと挙動がずれる。
# 検出する形を変えたら両方にケースを足す（フック本体のコメントにも書いてある）。
# このフックは「進行中の release/* があるときだけ」リマインドするため、
# サンドボックスのリポジトリに origin/release/* の参照を作ってから呼ぶ。

BRANCH_HOOK=$REPO/.claude/hooks/post-git-branch-reminder.sh

git -C "$SESSION" update-ref refs/remotes/origin/release/1.0.0 \
  "$(git -C "$SESSION" rev-parse production)"

# run_branch <期待する終了コード> <説明> <コマンド>
run_branch() {
  want=$1
  desc=$2
  command=$3

  LAST_OUT=$(cd "$SESSION" && jq -n --arg c "$command" '{tool_input:{command:$c}}' |
    sh "$BRANCH_HOOK" 2>&1)
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

echo
echo '=== post-git-branch-reminder: ブランチ作成の検出 ==='
run_branch 2 'checkout -b' 'git checkout -b feat/new-thing'
run_branch 2 'switch --create（長い形）' 'git switch --create feat/new-thing'
run_branch 2 'checkout --orphan' 'git checkout --orphan feat/new-thing'
run_branch 2 'worktree add <パス> -b（パスが先）' \
  'git worktree add ../wt -b feat/new-thing'
run_branch 2 'worktree add -b <名前> <パス>' \
  'git worktree add -b feat/new-thing ../wt'
run_branch 2 'git branch <名前>' 'git branch feat/new-thing'
run_branch 2 'worktree add <パス>（-b 無し）は basename がブランチ名になる' \
  'git worktree add ../foo-bar'
run_branch 0 'worktree add <パス> <既存ブランチ> は作成ではない' \
  'git worktree add ../wt feat/existing'
run_branch 0 'ブランチ作成ではない（切り替えだけ）' 'git checkout production'
run_branch 0 'git branch -D はブランチ作成ではない' 'git branch -D feat/existing'
run_branch 0 '同じコマンドで merge 済みなら何も言わない' \
  'git checkout -b feat/new-thing && git merge origin/release/1.0.0'

git -C "$SESSION" update-ref -d refs/remotes/origin/release/1.0.0
run_branch 0 '進行中の release/* が無ければ何も言わない' \
  'git checkout -b feat/new-thing'

# ---- stop-roadmap-reminder.sh ----

ROADMAP_HOOK=$REPO/.claude/hooks/stop-roadmap-reminder.sh
cp "$ROADMAP_HOOK" "$NOCONFIG/"

# run_roadmap <期待する終了コード> <説明> <入力 JSON> [フック本体のパス]
run_roadmap() {
  want=$1
  desc=$2
  input=$3
  hook=${4:-$ROADMAP_HOOK}

  LAST_OUT=$(cd "$SESSION" && printf '%s' "$input" | sh "$hook" 2>&1)
  status=$?

  if [ "$status" = "$want" ]; then
    pass=$((pass + 1))
    printf 'ok   [%s] %s\n' "$status" "$desc"
  else
    fail=$((fail + 1))
    printf 'FAIL [want %s got %s] %s\n     out: %s\n' "$want" "$status" "$desc" "$LAST_OUT"
  fi
}

echo
echo '=== stop-roadmap-reminder: 更新の有無を見る ==='
run_roadmap 0 '未コミットの変更が無ければ何も言わない' '{}'

mkdir -p "$SESSION/.claude/docs"
echo 'work' > "$SESSION/work.txt"
run_roadmap 2 '作業があるのに roadmap.md が未更新ならリマインドする' '{}'
run_roadmap 0 'フック起因の継続中は再度ブロックしない（session_id 無し）' \
  '{"stop_hook_active":true}'

# 回帰(#244): 3 つの Stop フックは同じ stop_hook_active を受け取る。一律に
# 早期 exit すると、DoD が先にブロックした後は roadmap の判定が走らない
run_roadmap 2 'DoD が先にブロックした継続でも判定は走る' \
  '{"stop_hook_active":true,"session_id":"s-roadmap"}'
run_roadmap 0 '同じセッションで 2 回目はブロックしない（無限ループ防止）' \
  '{"stop_hook_active":true,"session_id":"s-roadmap"}'
rm -f "${TMPDIR:-/tmp}/claude-stop-roadmap-s-roadmap"

# git diff は未追跡ファイルに 0 を返すため、新規作成した roadmap.md を
# 「更新されていない」と判定していた（/kickoff 直後がこの状態）
echo '# ロードマップ' > "$SESSION/.claude/docs/roadmap.md"
run_roadmap 0 '新規作成（未追跡）の roadmap.md でもリマインドしない' '{}'

git -C "$SESSION" add .claude/docs/roadmap.md
run_roadmap 0 'ステージ済みでもリマインドしない' '{}'

git -C "$SESSION" -c user.email=test@example.com -c user.name=test \
  commit -q -m 'docs: ロードマップ'
run_roadmap 2 'コミット済みで手が入っていなければリマインドする' '{}'

echo '## 機能ステータス表' >> "$SESSION/.claude/docs/roadmap.md"
run_roadmap 0 '追跡済みファイルの変更もリマインドしない' '{}'
git -C "$SESSION" checkout -q -- .claude/docs/roadmap.md

echo
echo '=== stop-roadmap-reminder: 設定で場所を差し替えられる ==='
echo '# 別の場所' > "$SESSION/other-roadmap.md"
HOOK_ROADMAP_FILE=other-roadmap.md
export HOOK_ROADMAP_FILE
run_roadmap 0 '差し替え先が更新されていればリマインドしない' '{}'
unset HOOK_ROADMAP_FILE
rm -f "$SESSION/other-roadmap.md"

echo
echo '=== stop-roadmap-reminder: config.sh が無くても既定値で動く ==='
run_roadmap 2 '既定のパスで判定する' '{}' "$NOCONFIG/stop-roadmap-reminder.sh"

rm -f "$SESSION/work.txt"


# ---- scripts/check-shell-compat.mjs ----
#
# bash 3.2（macOS の /bin/sh）で構文解析できない書き方の検出そのものを検証する。
# 検出できないと、フックが手元だけで丸ごと動かなくなる壊れ方が CI をすり抜ける。

if command -v node >/dev/null 2>&1; then
  # 経路ごとに別ディレクトリへ置く。1 つのディレクトリにまとめると、
  # 片方の検出が壊れてももう片方で終了コードが 1 になり、テストが通ってしまう。
  # ディレクトリ名に空白を入れるのは、URL.pathname のままだと開けないため
  COMPAT_BARE="$SANDBOX/compat bare"
  COMPAT_QUOTED="$SANDBOX/compat quoted"
  COMPAT_OK="$SANDBOX/compat ok"
  mkdir -p "$COMPAT_BARE" "$COMPAT_QUOTED" "$COMPAT_OK"

  # 素の case（パターンが ( で開かれていない）を置換の中に置く
  printf 'x=$(case $y in a) echo 1 ;; esac)\n' > "$COMPAT_BARE/bare.sh"
  # 二重引用符の中の置換も見る（$( ) は引用の中でも評価される）
  printf 'x="$(case $y in b) echo 1 ;; esac)"\n' > "$COMPAT_QUOTED/in-quotes.sh"
  printf 'x=$(case $y in (a) echo 1 ;; esac)\n' > "$COMPAT_OK/ok.sh"
  # 単一引用符の中は展開されないので、置換としては読まない
  printf "awk 'case) { }'\n" >> "$COMPAT_OK/ok.sh"
  # 引数として渡すだけの case / esac は予約語ではない（sh -n が通る形）
  printf "value=\$(printf '%%s' case)\nz=\$(printf '%%s' esac)\n" >> "$COMPAT_OK/ok.sh"

  # run_compat <期待する終了コード> <説明> <検査対象のディレクトリ>
  run_compat() {
    want=$1
    desc=$2
    dir=$3

    LAST_OUT=$(node "$REPO/scripts/check-shell-compat.mjs" "$dir" 2>&1)
    status=$?

    if [ "$status" = "$want" ]; then
      pass=$((pass + 1))
      printf 'ok   [%s] %s\n' "$status" "$desc"
    else
      fail=$((fail + 1))
      printf 'FAIL [want %s got %s] %s\n     out: %s\n' "$want" "$status" "$desc" "$LAST_OUT"
    fi
  }

  echo
  echo '=== check-shell-compat: bash 3.2 で落ちる書き方の検出 ==='
  run_compat 1 '置換の中の素の case を検出する' "$COMPAT_BARE"
  run_compat 1 '二重引用符の中の置換でも検出する' "$COMPAT_QUOTED"
  run_compat 0 'パターンを ( で開いていれば通す（空白を含むパスでも動く）' "$COMPAT_OK"
  # 検査が厳しすぎると、正しいスクリプトで CI が落ちる
  run_compat 0 '引数の case / esac では誤検出しない' "$COMPAT_OK"
  run_compat 0 'フック本体は通る' "$REPO/.claude/hooks"
else
  echo 'node が無いため check-shell-compat の検証をスキップします'
fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

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
run 0 'コミットメッセージ中の HUSKY=0 を迂回と誤認しない' \
  "git commit -m 'docs: HUSKY=0 について書く'" feat/existing
# HUSKY= （空）は husky を無効化しない。継承した HUSKY=0 を打ち消す用途がある
run 0 'HUSKY=（空）は無効化ではないので止めない' \
  "HUSKY= git commit -m 'feat: x'" feat/existing
run 2 '--no-verif（長いオプションの前方一致）' \
  "git commit --no-verif -m 'feat: x'" feat/existing
run 2 '--mes（--message の前方一致）でも規約を検証する' \
  "git commit --mes 'wip'" feat/existing
run 2 '2 つ目の -m に規約どおりのメッセージを置いても通さない' \
  "git commit -m 'wip' -m 'feat: x'" feat/existing
run 0 '1 つ目の -m が規約どおりなら通す（2 つ目は本文）' \
  "git commit -m 'feat: x' -m 'wip'" feat/existing

# 絞り込みループが行単位で読むため、複数行のメッセージは 1 行目で切れて
# 閉じクォートが無い状態で検証へ渡る。検証するのは先頭行なので値としては
# 足りているが、開きクォートを残したまま先頭一致で見ると規約どおりでも弾かれる
run 0 '複数行のメッセージ（ダブルクォート）' \
  'git commit -m "feat: なにかを追加

Co-Authored-By: someone <noreply@example.com>"' feat/existing
run 0 '複数行のメッセージ（シングルクォート）' \
  "git commit -m 'fix: なにかを直す

本文'" feat/existing
run 2 '複数行でも 1 行目が規約違反なら止める' \
  'git commit -m "wip

Co-Authored-By: someone <noreply@example.com>"' feat/existing
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
echo '=== chore/ は許可する（バージョン上げ・依存更新の置き場） ==='
run 0 'chore/* を production から切る' 'git checkout -b chore/bump-prettier-config'
run 2 'chore/ もケバブケースを外れると弾く' 'git checkout -b chore/Bump_Config'

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
run 0 'git を含まないコマンド' 'echo hello'
run 0 'コミットメッセージ中の ; では分割しない' \
  "git commit -m 'feat: a; b を追加'" feat/existing

# ---- post-edit-reminder.sh / stop-dod-check.sh ----
#
# この2つは config.sh からスタック依存の値を読む。設定が効くことと、
# config.sh が無くても既定値で動くこと（CLAUDE.md「スタック依存の値は
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

echo
echo '=== session-start-questions: 設定で場所を差し替えられる ==='
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
run_qstop 0 'フック起因の継続中は再度ブロックしない' '{"stop_hook_active":true}'

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

git -C "$SESSION" checkout -q -- .claude/docs/questions.md
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
run_roadmap 0 'フック起因の継続中は再度ブロックしない' '{"stop_hook_active":true}'

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

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

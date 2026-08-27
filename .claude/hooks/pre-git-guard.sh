#!/usr/bin/env sh
# PreToolUse (Bash) フック: CLAUDE.md「Git ブランチ運用」「コミットメッセージ規約」を
# 実行前に検証する（memory/evolution.md の Lv.4 = 強制実行）。
#
# 機械的に白黒つく違反は deny（exit 2 でブロック。Claude が自力で直して再実行できる）、
# 例外がありうる操作は ask（ユーザーに承認を求める）で扱う。

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

[ -z "$cmd" ] && exit 0

# heredoc の本文は、他のプログラムへ渡されるデータ（ファイルの中身、スクリプト、
# ドキュメント）であって実行される git コマンドではないため、検査対象から外す。
# ここを見てしまうと、コマンド例を含むドキュメントやスクリプトを書けなくなる。
# 例外は 2 つ:
#   - commit -m "$(cat <<'EOF' ...)" -> 本文はコミットメッセージそのものなので検査する
#   - sh / bash <<'EOF' ...          -> 本文は実際に実行されるので検査する
cmd=$(printf '%s' "$cmd" | awk '
  in_body {
    if ($0 == marker) { in_body = 0 }
    next
  }
  {
    print
    if (match($0, /<<-?[[:space:]]*"?'"'"'?[A-Za-z_][A-Za-z_0-9]*'"'"'?"?/) &&
        $0 !~ /git[[:space:]]+commit/ &&
        $0 !~ /(^|[[:space:]|;&(])(sh|bash|zsh|dash|ksh)([[:space:]]|$)/) {
      marker = substr($0, RSTART, RLENGTH)
      sub(/^<<-?[[:space:]]*/, "", marker)
      gsub(/["'"'"']/, "", marker)
      in_body = 1
    }
  }
')

printf '%s' "$cmd" | grep -q 'git' || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

TYPES='feat|fix|refactor|style|docs|test|chore'
DOC='詳細は CLAUDE.md「Git ブランチ運用」/ .claude/docs/git-workflow.md を参照。'

deny() {
  printf '%s\n%s\n' "$1" "$DOC" >&2
  exit 2
}

ask() {
  jq -n --arg r "$1
$DOC" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

has() { printf '%s' "$cmd" | grep -Eq "$1"; }

current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# --- 検証のスキップ禁止 -------------------------------------------------
# husky（commitlint / lint-staged）を迂回されるとコミット規約が無力化する
if { has '(^|[[:space:]])git[[:space:]]+(commit|push)' && has '(^|[[:space:]])--no-verify([[:space:]]|$)'; } ||
  has '(^|[[:space:]])git[[:space:]]+commit[[:space:]]+-n([[:space:]]|$)'; then
  deny '--no-verify / commit -n による検証スキップは禁止です。husky の commitlint / lint-staged が規約の実体なので、失敗したら迂回せず原因を直してください。'
fi

# --- コミット -----------------------------------------------------------
if has '(^|[[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  case "$current" in
    production)
      deny "production への直接コミットは禁止です（PR 必須）。作業ブランチを切ってください。"
      ;;
    release/*)
      deny "release/* への直接コミットは禁止です（push が staging への自動デプロイを発火するため）。fix/* を切って release へ PR でマージしてください。現在: $current"
      ;;
  esac

  # メッセージをインラインで渡している場合のみ形式を検証する
  # （--amend --no-edit のようなメッセージ再利用は対象外）
  if has '(^|[[:space:]])(-m|--message)([[:space:]]|=)'; then
    if ! has "(^|[[:space:]\"'])($TYPES)(\([^)]+\))?: [^[:space:]]"; then
      deny "コミットメッセージ規約違反です。'<type>: <description>' 形式にしてください（type: feat, fix, refactor, style, docs, test, chore）。例: 'feat: ユーザープロフィール画面を追加'"
    fi
  fi
fi

# --- push ---------------------------------------------------------------
if has '(^|[[:space:]])git[[:space:]]+push'; then
  # 明示指定と、production 上での引数なし push（= 現在ブランチへの push）の両方を見る
  if has '(^|[[:space:]])git[[:space:]]+push[^|;&]*[[:space:]]production([[:space:]]|$)' ||
    has '(^|[[:space:]])git[[:space:]]+push[^|;&]*:production([[:space:]]|$)' ||
    { [ "$current" = "production" ] && has '(^|[[:space:]])git[[:space:]]+push[[:space:]]*($|[&|;])'; }; then
    deny 'production への直接 push は禁止です（PR 必須）。'
  fi

  if has '(--force([[:space:]]|$)|--force-with-lease|(^|[[:space:]])-f([[:space:]]|$))' &&
    { has '[[:space:]](production|release/[^[:space:]]+)([[:space:]]|$)' || case "$current" in production | release/*) true ;; *) false ;; esac; }; then
    deny 'production / release/* への force push は禁止です。'
  fi

  # release/* への push は「ブランチ作成時」と「PR マージ」のみ許可（判別できないため確認する）
  if has '(^|[[:space:]])git[[:space:]]+push[^|;&]*[[:space:]]release/' ||
    { case "$current" in release/*) has '(^|[[:space:]])git[[:space:]]+push[[:space:]]*($|[&|;])' ;; *) false ;; esac; }; then
    ask "release/* への push は staging への自動デプロイを発火します。ブランチ作成時または PR マージ以外の push は禁止です。実行してよいかユーザーに確認してください。"
  fi
fi

# --- ブランチ作成 -------------------------------------------------------
newbranch=$(printf '%s' "$cmd" |
  grep -oE '(^|[[:space:]])git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)[[:space:]]+[^[:space:];&|]+' |
  head -1 | awk '{print $NF}')

if [ -n "$newbranch" ]; then
  case "$newbranch" in
    feat/* | fix/* | refactor/* | test/* | docs/* | release/* | hotfix/* | claude/*) ;;
    *)
      deny "ブランチ命名規則違反です: $newbranch。feat/ fix/ refactor/ test/ docs/ release/ hotfix/ のいずれかで始めてください。"
      ;;
  esac

  # プレフィックスの後ろはケバブケース（小文字英数字とハイフン）。
  # release/hotfix はバージョン表記（1.0.0 / 1.0.0-rc1）を使うためドットも許す。
  branch_name=${newbranch#*/}
  case "$newbranch" in
    claude/*) ;; # ハーネスが生成するリモートセッション用ブランチは対象外
    release/* | hotfix/*)
      printf '%s' "$branch_name" | grep -Eq '^[a-z0-9]+([.-][a-z0-9]+)*$' ||
        deny "ブランチ名が命名規則に合いません: $newbranch。release/ hotfix/ の後ろはバージョン表記（例: release/1.0.0）にしてください。"
      ;;
    *)
      printf '%s' "$branch_name" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$' ||
        deny "ブランチ名はケバブケース（小文字英数字とハイフン区切り）にしてください: $newbranch。例: feat/user-profile、チケット番号があれば feat/123-user-profile"
      ;;
  esac

  # 最新の remote 情報を持たずに切ると、進行中の release/* を見落として
  # 何ヶ月も古い土台の上で作業を始めてしまう
  gitdir=$(git rev-parse --git-dir 2>/dev/null)
  fetch_hint="先に次を実行して、進行中のリリースを確認してください:
  git fetch origin --prune && git branch -r --list 'origin/release/*'"

  if [ ! -e "$gitdir/FETCH_HEAD" ]; then
    deny "このリポジトリでまだ一度も fetch していません。$fetch_hint"
  # find が使えない環境では鮮度を判定できないので、ブロックせず通す
  elif fresh=$(find "$gitdir/FETCH_HEAD" -mmin -15 2>/dev/null) && [ -z "$fresh" ]; then
    deny "直近15分以内に fetch していません。git branch -a はローカルの参照しか表示しないため、$fetch_hint"
  fi

  # 分岐元は production（例外: QA 修正の fix/* は release/* から切る）
  base=$(printf '%s' "$cmd" |
    grep -oE "(checkout[[:space:]]+-b|switch[[:space:]]+-c)[[:space:]]+$newbranch[[:space:]]+[^[:space:];&|]+" |
    head -1 | awk '{print $NF}')
  # 同一コマンド内で production へ切り替えてから分岐する（ドキュメントの手順）ケースを
  # 現在ブランチ起点と誤判定しないよう、チェーンの前半を分岐元として扱う
  if [ -z "$base" ] && has '(^|[[:space:]])git[[:space:]]+(checkout|switch)[[:space:]]+production([[:space:]]|$|&|;)'; then
    base="production"
  fi
  [ -z "$base" ] && base="$current"
  base=${base#origin/}
  base=${base#refs/heads/}

  case "$newbranch" in
    claude/*) ;;
    fix/*)
      case "$base" in
        production | release/*) ;;
        *) deny "fix/* は production または release/* から切ってください（現在の分岐元: $base）。" ;;
      esac
      ;;
    *)
      if [ "$base" != "production" ]; then
        deny "作業ブランチは production から切ってください（現在の分岐元: $base）。release/* から切るとそのリリース行きに固定され、次のリリースへ回す選択ができなくなります。
  git checkout production && git pull && git checkout -b $newbranch"
      fi
      ;;
  esac
fi

exit 0

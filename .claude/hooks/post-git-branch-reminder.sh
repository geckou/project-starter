#!/usr/bin/env sh
# PostToolUse (Bash) フック: 作業ブランチを新規作成した直後に、進行中の release/* が
# あればマージ要否の確認を促す（.claude/docs/git-workflow.md「なぜ release をマージするのか」）。

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

[ -z "$cmd" ] && exit 0
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)' || exit 0

# 同じコマンド内で既に merge しているなら何も言わない
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])git[[:space:]]+merge' && exit 0

releases=$(git branch -r --list 'origin/release/*' 2>/dev/null | sed 's|^[[:space:]]*origin/||')
[ -z "$releases" ] && exit 0

{
  echo "進行中のリリースブランチがあります:"
  printf '%s\n' "$releases" | sed 's/^/  - /'
  echo "この作業をそのリリースに載せるなら 'git merge origin/<release>' を実行してから開発を始めてください（production は前回リリース時点で止まっているため、マージせずに進めるとリリース PR で大量コンフリクトになります）。載せない作業ならマージ不要です。判断がつかない場合はユーザーに確認してください。"
} >&2

exit 2

#!/usr/bin/env sh
# SessionStart フック: セッション開始時に remote を最新化し、ブランチ状況を文脈に入れる。
# 「fetch せずに古い情報のまま作業内容を確認・判断する」ことを防ぐ
# （CLAUDE.md「Git ブランチ運用」/ .claude/docs/git-workflow.md「作業ブランチの切り方」）。
#
# 標準出力はそのままセッションの文脈に追加される。

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

if command -v timeout >/dev/null 2>&1; then
  timeout 30 git fetch origin --prune >/dev/null 2>&1
else
  git fetch origin --prune >/dev/null 2>&1
fi
fetch_status=$?

current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
releases=$(git branch -r --list 'origin/release/*' 2>/dev/null | sed 's|^[[:space:]]*origin/||')
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

echo "## Git 状況（SessionStart フックが自動取得）"
echo

if [ "$fetch_status" -ne 0 ]; then
  echo "- ⚠️ git fetch に失敗しました（ネットワーク不通の可能性）。以下の情報は古い可能性があります。"
else
  echo "- git fetch origin --prune 実行済み（この情報は最新）"
fi

echo "- 現在のブランチ: \`$current\`"
echo "- 未コミットの変更: ${dirty} 件"

if git rev-parse --verify origin/production >/dev/null 2>&1; then
  counts=$(git rev-list --left-right --count origin/production...HEAD 2>/dev/null)
  behind=$(printf '%s' "$counts" | awk '{print $1}')
  ahead=$(printf '%s' "$counts" | awk '{print $2}')
  echo "- origin/production との差分: behind ${behind:-?} / ahead ${ahead:-?}"
fi

if [ -n "$releases" ]; then
  echo "- 進行中のリリースブランチ:"
  printf '%s\n' "$releases" | sed 's/^/  - /'
else
  echo "- 進行中のリリースブランチ: なし"
fi

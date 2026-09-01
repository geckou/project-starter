#!/usr/bin/env sh
# SessionStart フック: 未回答の確認事項をセッション冒頭の文脈に入れる。
#
# 確認待ちでセッションを止めないために、確認事項は questions.md に積んで実装を進める
# （CLAUDE.md「自律性の境界」）。積んだまま誰も見ない状態になるのを防ぐのがこのフック。
# ユーザーの細切れの空き時間に「まとめて答える」入口でもある。
#
# 標準出力はそのままセッションの文脈に追加される。
# 確認事項ファイルの場所は config.sh で差し替えられる（無ければ既定値で動く）。

hook_dir=$(dirname "$0")
[ -f "$hook_dir/config.sh" ] && . "$hook_dir/config.sh"

file=${HOOK_QUESTIONS_FILE:-.claude/docs/questions.md}

[ -f "$file" ] || exit 0

# 「## 未回答」セクションの中の見出し（### で始まる行）だけを拾う
pending=$(awk '
  /^## 未回答/ { in_section = 1; next }
  /^## / { in_section = 0 }
  in_section && /^### / { sub(/^### /, ""); print }
' "$file")

[ -z "$pending" ] && exit 0

count=$(printf '%s\n' "$pending" | wc -l | tr -d ' ')

echo "## 未回答の確認事項（${count} 件）"
echo
printf '%s\n' "$pending" | sed 's/^/- /'
echo
echo "選択肢・推奨案・影響範囲は \`$file\` にある。ユーザーが答えられる状況なら \`/questions\` でまとめて提示する。回答が出た項目は「回答済み」へ移し、保留していた作業を再開する。"

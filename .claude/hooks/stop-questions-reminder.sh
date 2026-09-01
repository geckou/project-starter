#!/usr/bin/env sh
# Stop フック: この作業中に確認事項が増えていたら、終了する前にユーザーへ提示させる。
#
# questions.md に積むのは「後でまとめて聞く」ためであって、黙って先送りするためではない。
# 積んだことを言わずに終わると、仮決定がレビューされないまま積み上がる。
#
# 判定はファイルの未コミット変更の有無だけで行う（この作業で積んだかどうか）。
# 積んでいないセッションでは何も言わない。

command -v jq >/dev/null 2>&1 || exit 0

hook_dir=$(dirname "$0")
[ -f "$hook_dir/config.sh" ] && . "$hook_dir/config.sh"

file=${HOOK_QUESTIONS_FILE:-.claude/docs/questions.md}

input=$(cat)

# リマインド起因の継続中は再度ブロックしない（無限ループ防止）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

[ -f "$file" ] || exit 0

# 未追跡ファイルも拾うため git diff ではなく git status を使う
[ -z "$(git status --porcelain -- "$file" 2>/dev/null)" ] && exit 0

echo "この作業で確認事項が追加されています（$file）。終了する前に、未回答の項目を選択肢・推奨案つきでユーザーに提示してください。仮決定して実装した箇所は、回答が変わったときに何を直すのかも併せて伝えます。" >&2
exit 2

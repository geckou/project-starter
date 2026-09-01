#!/usr/bin/env sh
# Stop フック: この作業で確認事項が増えていたら、終了する前にユーザーへ提示させる。
#
# questions.md に積むのは「後でまとめて聞く」ためであって、黙って先送りするためではない。
# 積んだことを言わずに終わると、保留された作業が誰にも見えないまま溜まる。
#
# 判定は「未回答の項目が増えたか」で行う。ファイルが dirty かどうかでは判定しない
# （/questions が回答済みへ移した直後もファイルは dirty になるため、
# 何も積んでいないのに提示を求めてしまう）。

command -v jq >/dev/null 2>&1 || exit 0

hook_dir=$(dirname "$0")
[ -f "$hook_dir/config.sh" ] && . "$hook_dir/config.sh"

file=${HOOK_QUESTIONS_FILE:-.claude/docs/questions.md}

input=$(cat)

# リマインド起因の継続中は再度ブロックしない（無限ループ防止）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

[ -f "$file" ] || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# 「## 未回答」セクションの見出しだけを取り出す（session-start-questions.sh と同じ抽出）
extract_pending() {
  awk '
    /^## 未回答/ { in_section = 1; next }
    /^## / { in_section = 0 }
    in_section && /^### / { sub(/^### /, ""); print }
  '
}

current=$(extract_pending < "$file")
[ -z "$current" ] && exit 0

# 比較対象は HEAD の版。未追跡・初回コミット前なら空になり、全項目が「この作業で積んだ」になる
base=$(git show "HEAD:$file" 2>/dev/null | extract_pending)

# base に無い見出しだけが、この作業で積まれたもの
added=$(printf '%s\n' "$current" | grep -vxF "$base")
[ -z "$added" ] && exit 0

count=$(printf '%s\n' "$added" | wc -l | tr -d ' ')

echo "この作業で確認事項が ${count} 件追加されています（$file）。終了する前に、未回答の項目を選択肢・推奨案つきでユーザーに提示してください。それぞれが「どの作業を止めているか」も併せて伝えます。" >&2
exit 2

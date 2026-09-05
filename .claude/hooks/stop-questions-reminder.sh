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

# フック起因の継続中でも、このフック自身がまだブロックしていなければ判定する。
# 3 つの Stop フックは同じ stop_hook_active を受け取るため、一律に早期 exit すると
# 先にブロックした 1 つ以外の判定がそのセッションで一度も走らなくなる。
# 無限ループは「このフックが 1 回ブロックしたら、そのセッションでは以後黙る」で防ぐ
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
session=$(printf '%s' "$input" | jq -r '.session_id // empty')
marker=''
[ -n "$session" ] && marker="${TMPDIR:-/tmp}/claude-stop-questions-$session"

if [ "$active" = "true" ]; then
  # session_id を受け取れない環境では、従来どおり一律に抜ける
  [ -z "$marker" ] && exit 0
  [ -f "$marker" ] && exit 0
fi

# ブロックしない経路では印を消す（次のセッションや状況の変化に引きずられない）
pass() {
  [ -n "$marker" ] && rm -f "$marker"
  exit 0
}

block() {
  [ -n "$marker" ] && : > "$marker"
  exit 2
}

[ -f "$file" ] || pass
git rev-parse --git-dir >/dev/null 2>&1 || pass

# 「## 未回答」セクションの見出しだけを取り出す（session-start-questions.sh と同じ抽出）。
# HTML コメントの中は読み飛ばす（記入例の見出しを項目として数えないため）
extract_pending() {
  awk '
    in_comment { if (/-->/) in_comment = 0; next }
    /<!--/ { if (!/-->/) in_comment = 1; next }
    /^## 未回答/ { in_section = 1; next }
    /^## / { in_section = 0; next }
    in_section && /^### / { sub(/^### /, ""); print }
  '
}

current=$(extract_pending < "$file")
[ -z "$current" ] && pass

# 比較対象は HEAD の版。未追跡・初回コミット前なら空になり、全項目が「この作業で積んだ」になる
# git show はリポジトリ相対のパスしか受けない。絶対パスを渡されたまま
# HEAD:/abs/... を引くと必ず失敗し、base が空 = 全項目が「今回積んだ」になって
# 未回答が 1 件でもあれば毎回ブロックしてしまう
rel_file=$file
case $file in
  /*)
    toplevel=$(git rev-parse --show-toplevel 2>/dev/null)
    case $file in
      "$toplevel"/*) rel_file=${file#"$toplevel"/} ;;
    esac
    ;;
esac

base=$(git show "HEAD:$rel_file" 2>/dev/null | extract_pending)

# base に無い見出しだけが、この作業で積まれたもの
added=$(printf '%s\n' "$current" | grep -vxF "$base")
[ -z "$added" ] && pass

count=$(printf '%s\n' "$added" | wc -l | tr -d ' ')

echo "この作業で確認事項が ${count} 件追加されています（$file）。終了する前に、未回答の項目を選択肢・推奨案つきでユーザーに提示してください。それぞれが「どの作業を止めているか」も併せて伝えます。" >&2
block

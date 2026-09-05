#!/usr/bin/env sh
# Stop フック: 作業（未コミット変更）があるのに roadmap.md が未更新なら1回だけリマインドする
# memory/evolution.md の Lv.4（Hook = 強制実行）の実体
#
# ロードマップの場所はドキュメントの持ち方に依存するため config.sh に置く（無ければ既定値で動く）

command -v jq >/dev/null 2>&1 || exit 0

hook_dir=$(dirname "$0")
[ -f "$hook_dir/config.sh" ] && . "$hook_dir/config.sh"

roadmap=${HOOK_ROADMAP_FILE:-.claude/docs/roadmap.md}

input=$(cat)

# フック起因の継続中でも、このフック自身がまだブロックしていなければ判定する。
# 3 つの Stop フックは同じ stop_hook_active を受け取るため、一律に早期 exit すると
# 先にブロックした 1 つ以外の判定がそのセッションで一度も走らなくなる。
# 無限ループは「このフックが 1 回ブロックしたら、そのセッションでは以後黙る」で防ぐ
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
session=$(printf '%s' "$input" | jq -r '.session_id // empty')
marker=''
[ -n "$session" ] && marker="${TMPDIR:-/tmp}/claude-stop-roadmap-$session"

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

# 未コミットの変更がなければ（作業していなければ）何もしない
[ -z "$(git status --porcelain 2>/dev/null)" ] && pass

# roadmap.md に手が入っていれば OK。git diff ではなく git status で見るのは、
# git diff が未追跡ファイルに 0 を返すため（/kickoff で roadmap.md を新規作成した
# 直後は「更新されていない」と判定され、更新済みなのにリマインドが出ていた）
[ -n "$(git status --porcelain -- "$roadmap" 2>/dev/null)" ] && pass

echo '未コミットの変更がありますが roadmap.md が更新されていません。機能ステータス表・引き継ぎの更新が必要か確認してください（/wrap-up 推奨）。ドキュメント更新が不要な作業なら、そのまま終了して構いません。' >&2
block

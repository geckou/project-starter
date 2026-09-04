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

# リマインド起因の継続中は再度ブロックしない（無限ループ防止）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

# 未コミットの変更がなければ（作業していなければ）何もしない
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

# roadmap.md に手が入っていれば OK。git diff ではなく git status で見るのは、
# git diff が未追跡ファイルに 0 を返すため（/kickoff で roadmap.md を新規作成した
# 直後は「更新されていない」と判定され、更新済みなのにリマインドが出ていた）
[ -n "$(git status --porcelain -- "$roadmap" 2>/dev/null)" ] && exit 0

echo '未コミットの変更がありますが roadmap.md が更新されていません。機能ステータス表・引き継ぎの更新が必要か確認してください（/wrap-up 推奨）。ドキュメント更新が不要な作業なら、そのまま終了して構いません。' >&2
exit 2

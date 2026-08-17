#!/usr/bin/env sh
# Stop フック: 作業（未コミット変更）があるのに roadmap.md が未更新なら1回だけリマインドする
# memory/evolution.md の Lv.4（Hook = 強制実行）の実体

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# リマインド起因の継続中は再度ブロックしない（無限ループ防止）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

# 未コミットの変更がなければ（作業していなければ）何もしない
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

# roadmap.md 自体が変更済み（未ステージ or ステージ済み）なら OK
if ! git diff --quiet -- .claude/docs/roadmap.md 2>/dev/null; then exit 0; fi
if ! git diff --quiet --cached -- .claude/docs/roadmap.md 2>/dev/null; then exit 0; fi

echo '未コミットの変更がありますが roadmap.md が更新されていません。機能ステータス表・引き継ぎの更新が必要か確認してください（/wrap-up 推奨）。ドキュメント更新が不要な作業なら、そのまま終了して構いません。' >&2
exit 2

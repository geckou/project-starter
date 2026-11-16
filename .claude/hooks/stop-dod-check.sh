#!/usr/bin/env sh
# Stop フック: コードの未コミット変更があるとき DoD を自動実行し、
# 失敗していれば停止をブロックして修正を促す（フック起因の継続中は 1 セッションで 1 回まで）
# CLAUDE.md「機能の完了条件（Definition of Done）」の機械判定
#
# 実行するコマンド・対象拡張子はスタック依存のため config.sh に置く（無ければ既定値で動く）

hook_dir=$(dirname "$0")
[ -f "$hook_dir/config.sh" ] && . "$hook_dir/config.sh"

runner=${HOOK_RUNNER:-yarn}
tasks=${HOOK_DOD_TASKS:-'type-check lint test'}
extensions=${HOOK_CODE_EXTENSIONS:-'ts|tsx|js|jsx|mjs|cjs|rules'}

command -v jq >/dev/null 2>&1 || exit 0
command -v "$runner" >/dev/null 2>&1 || exit 0

input=$(cat)

# フック起因の継続中でも、このフック自身がまだブロックしていなければ判定する。
# Stop フックは 4 つとも同じ stop_hook_active を受け取るため、一律に早期 exit すると、
# 先に他のフック（roadmap / questions / pr）がブロックした継続では DoD が走らず、
# type-check / lint / test が落ちたままセッションを終われてしまう（#363）。
# 無限ループは「このフックが 1 回ブロックしたら、そのセッションでは以後黙る」で防ぐ
# （他の 3 つと同じ方式。stop-roadmap-reminder.sh を参照）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
session=$(printf '%s' "$input" | jq -r '.session_id // empty')
marker=''
[ -n "$session" ] && marker="${TMPDIR:-/tmp}/claude-stop-dod-$session"

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

# コードファイルの未コミット変更がなければ何もしない（ドキュメントのみの作業では走らせない）
# -z を付けるのは、既定の出力が空白や非 ASCII を含むパスを `?? "my file.ts"` と
# C 形式でクォートするため。末尾が `"` になって拡張子の判定に当たらず、
# 空白入りのファイルを足した作業で DoD が走らないまま終了できてしまう。
# -z はクォートせず NUL 区切りで出すので、改行に直してからステータス欄（先頭3文字）を落とす
# （リネームは `XY 新パス` と `旧パス` の2レコードに分かれ、旧パス側は先頭3文字が
# 削れるが、拡張子の判定には影響しない）
# -uall を付けないと、新規ディレクトリは `?? src/newdir/` の 1 行にまとめられ、
# 拡張子の判定に当たらない（新しいコンポーネント群を丸ごと足した作業で
# type-check / lint / test が走らないまま終了できてしまう）
changed=$(git status --porcelain -z -uall 2>/dev/null | tr '\0' '\n' | cut -c4- | grep -E "\.($extensions)\$")
[ -z "$changed" ] && pass

failed=''
log_dir="${TMPDIR:-/tmp}"

for task in $tasks; do
  log="$log_dir/dod-$task.log"

  # npm はスクリプト名を直接渡せないため run 経由で統一する
  # （yarn / pnpm / bun は直接でも動くが、run はいずれでも通る）
  if ! "$runner" run "$task" >"$log" 2>&1; then
    failed="${failed:+$failed / }$runner run $task"

    echo "--- $runner run $task 失敗（末尾30行） ---" >&2
    tail -n 30 "$log" >&2
  fi
done

[ -z "$failed" ] && pass

echo "DoD 未達: $failed が失敗しています。上記のエラーを修正してから終了してください。修正が大きくなる場合や意図的に途中終了する場合は、その旨をユーザーに報告してください。" >&2
block

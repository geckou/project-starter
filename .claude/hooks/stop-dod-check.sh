#!/usr/bin/env sh
# Stop フック: コードの未コミット変更があるとき DoD を自動実行し、
# 失敗していれば停止を1回だけブロックして修正を促す
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

# フック起因の継続中は再度ブロックしない（無限ループ防止・ブロックは1回まで）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

# コードファイルの未コミット変更がなければ何もしない（ドキュメントのみの作業では走らせない）
# 空白入りのパス（"my file.ts"）でも拡張子を判定できるよう、
# ステータス欄（先頭3文字）だけを落として残りをそのままパス名として扱う
changed=$(git status --porcelain 2>/dev/null | cut -c4- | grep -E "\.($extensions)\$")
[ -z "$changed" ] && exit 0

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

[ -z "$failed" ] && exit 0

echo "DoD 未達: $failed が失敗しています。上記のエラーを修正してから終了してください。修正が大きくなる場合や意図的に途中終了する場合は、その旨をユーザーに報告してください。" >&2
exit 2

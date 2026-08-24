#!/usr/bin/env sh
# Stop フック: コードの未コミット変更があるとき DoD（yarn type-check / lint / test）を
# 自動実行し、失敗していれば停止を1回だけブロックして修正を促す
# CLAUDE.md「機能の完了条件（Definition of Done）」の機械判定

command -v jq >/dev/null 2>&1 || exit 0
command -v yarn >/dev/null 2>&1 || exit 0

input=$(cat)

# フック起因の継続中は再度ブロックしない（無限ループ防止・ブロックは1回まで）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

# コードファイルの未コミット変更がなければ何もしない（ドキュメントのみの作業では走らせない）
changed=$(git status --porcelain 2>/dev/null | awk '{print $NF}' | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|rules)$')
[ -z "$changed" ] && exit 0

failed=''
log_dir="${TMPDIR:-/tmp}"

for task in type-check lint test; do
  log="$log_dir/dod-$task.log"

  if ! yarn "$task" >"$log" 2>&1; then
    failed="$failed $task"

    echo "--- yarn $task 失敗（末尾30行） ---" >&2
    tail -n 30 "$log" >&2
  fi
done

[ -z "$failed" ] && exit 0

echo "DoD 未達: yarn$failed が失敗しています。上記のエラーを修正してから終了してください。修正が大きくなる場合や意図的に途中終了する場合は、その旨をユーザーに報告してください。" >&2
exit 2

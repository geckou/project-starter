#!/usr/bin/env sh
# PostToolUse (Edit|Write) フック: 影響の大きいファイルの変更時に検証コマンドをリマインドする
# memory/evolution.md の Lv.4（Hook = 強制実行）の実体
#
# 監視するパスと文言はスタック依存のため config.sh に置く（無ければ既定値で動く）

hook_dir=$(dirname "$0")
[ -f "$hook_dir/config.sh" ] && . "$hook_dir/config.sh"

watch_paths=${HOOK_WATCH_PATHS:-'
firestore.rules	firestore.rules が変更されました。yarn test:rules でルールテスト（許可/拒否）を実行してください。
packages/shared	packages/shared が変更されました。全 workspace に影響するため yarn type-check を実行してください。
'}

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

# 各行の <パスパターン><TAB><メッセージ> を順に評価し、最初に一致したものを返す
printf '%s\n' "$watch_paths" | while IFS="$(printf '\t')" read -r pattern message; do
  [ -z "$pattern" ] && continue
  [ -z "$message" ] && continue

  # file_path は絶対パス・リポジトリ相対パスのどちらでも渡りうるため両方にマッチさせる。
  # パターンがディレクトリの場合は配下のファイルも対象にする
  case "$file" in
    "$pattern" | */"$pattern" | "$pattern"/* | */"$pattern"/*)
      echo "$message" >&2
      exit 2
      ;;
  esac
done

# while はサブシェルで動くため、パイプ全体の終了ステータスで判定する
exit $?

#!/usr/bin/env sh
# PostToolUse (Edit|Write) フック: 影響の大きいファイルの変更時に検証コマンドをリマインドする
# memory/evolution.md の Lv.4（Hook = 強制実行）の実体

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# file_path は絶対パス・リポジトリ相対パスのどちらでも渡りうるため両方にマッチさせる
case "$file" in
  firestore.rules | */firestore.rules)
    echo 'firestore.rules が変更されました。yarn test:rules でルールテスト（許可/拒否）を実行してください。' >&2
    exit 2
    ;;
  packages/shared/* | */packages/shared/*)
    echo 'packages/shared が変更されました。全 workspace に影響するため yarn type-check を実行してください。' >&2
    exit 2
    ;;
esac

exit 0

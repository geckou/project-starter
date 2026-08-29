#!/usr/bin/env bash
set -u

# ドキュメントが実在しないファイルを指していないか検査する。
#
# コードを移動・削除したときにドキュメントの追従を忘れると、読んだ人（と AI）が
# 存在しないパスを前提に作業してしまう。型チェックにもテストにも引っかからないため、
# ここで機械的に検出する。
#
# 検査するもの:
#   1. リポジトリ相対パスの言及（apps/ packages/ scripts/ tests/ .claude/ .github/ 配下）
#   2. Markdown の相対リンク先（[text](path)）
#
# node_modules に依存しないので yarn install なしで実行できる。
# 実体を package.json ではなくこのスクリプトに置いている理由は
# scripts/test-hooks.sh と同じ（ルート package.json は Template Sync の対象外）。

cd "$(dirname "$0")/.."

# 実在しなくてよいパス。gitignore されるファイルと、必要になった時点で作るもの
ALLOW_MISSING='
apps/functions/.env
apps/mobile/.env.local
.claude/docs/roadmap-archive.md
'

# 言及を拾う対象の接頭辞。これ以外（page.tsx のような汎用名や、
# nuxt-nextjs.md が例示する Nuxt 側の server/api/ 等）は誤検出になるので拾わない
PREFIXES='apps|packages|scripts|tests|\.claude|\.github'

findings=$(mktemp)
trap 'rm -f "$findings"' EXIT

is_allowed() { printf '%s\n' "$ALLOW_MISSING" | grep -qxF "$1"; }

# プレースホルダ・グロブ・変数展開を含む記述は検査対象にしない
is_literal() {
  case "$1" in
    *'*'* | *'{'* | *'<'* | *'$'* | *'…'* | *' '*) return 1 ;;
    *) return 0 ;;
  esac
}

checked=0

# 追跡されている Markdown が対象（node_modules は git 管理外なので自然に外れる）。
# .claude/skills/ は除外する。スキルは「これから作るファイル」を書くものなので、
# 実在しないパスを含むのが正しい（apps/admin/ や scheduled.ts 等）
for doc in $(git ls-files '*.md' | grep -v '^\.claude/skills/'); do
  checked=$((checked + 1))

  # --- 1. リポジトリ相対パスの言及 ---
  grep -nEo "(^|[^a-zA-Z0-9_/.-])($PREFIXES)/[a-zA-Z0-9_@./{}*<>-]+" "$doc" 2>/dev/null |
    while IFS=: read -r line match; do
      # 先頭に紛れ込んだ区切り文字と、文末の句読点・括弧を落とす
      path=$(printf '%s' "$match" | sed -E 's/^[^a-zA-Z._]+//; s/[.,)）。、:]+$//')

      is_literal "$path" || continue
      is_allowed "$path" && continue
      [ -e "$path" ] && continue

      printf '%s:%s\t%s\n' "$doc" "$line" "$path" >>"$findings"
    done

  # --- 2. Markdown の相対リンク（記述元ファイルからの相対）---
  grep -nEo '\]\([^)]+\)' "$doc" 2>/dev/null |
    while IFS=: read -r line match; do
      target=$(printf '%s' "$match" | sed -E 's/^\]\(//; s/\)$//; s/#.*$//')

      [ -z "$target" ] && continue
      case "$target" in http*|mailto:*|/*) continue ;; esac

      is_literal "$target" || continue
      is_allowed "$target" && continue
      [ -e "$(dirname "$doc")/$target" ] && continue

      printf '%s:%s\tリンク先 %s\n' "$doc" "$line" "$target" >>"$findings"
    done
done

# 同じ行がパス言及とリンクの両方で拾われることがあるため、重複を除いてから数える
sort -u "$findings" -o "$findings"
fail=$(wc -l <"$findings" | tr -d ' ')

if [ "$fail" -gt 0 ]; then
  echo '=== 参照切れ ==='
  while IFS=$'\t' read -r where what; do
    printf 'FAIL %-44s %s が存在しません\n' "$where" "$what"
  done <"$findings"
fi

printf '\n%s ファイルを検査、%s 件の参照切れ\n' "$checked" "$fail"

if [ "$fail" -gt 0 ]; then
  {
    echo
    echo 'ドキュメントが実在しないパスを指しています。移動先に書き換えるか、'
    echo '意図的に存在しないもの（gitignore 対象など）なら'
    echo 'scripts/check-docs.sh の ALLOW_MISSING に追加してください。'
  } >&2
  exit 1
fi

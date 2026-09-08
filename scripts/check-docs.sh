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
apps/functions/.secret.local
apps/mobile/.env.local
.claude/docs/roadmap-archive.md
packages/shared/dist/
'

# 言及を拾う対象の接頭辞。これ以外（page.tsx のような汎用名や、
# nuxt-nextjs.md が例示する Nuxt 側の server/api/ 等）は誤検出になるので拾わない
PREFIXES='apps|packages|scripts|tests|\.claude|\.github'

# テンプレート本体にしか存在しないファイル。
# `.templatesyncignore` の template-only:start / :end で囲んだ範囲が正で、
# ここではその一覧を読むだけ（2 か所に書くと必ず片方が古くなる）。
#
# ドキュメント（.claude/docs/ 等）は同期されるが、これらのファイルは同期されない。
# そのため派生プロジェクトでは「同期されたドキュメントが、同期されないファイルを
# 指している」状態になり、テンプレートを素直に取り込んだだけで必ず赤くなっていた。
# テンプレート本体では実在するので、通常どおり検査対象になる
TEMPLATE_ONLY=''

if [ -f .templatesyncignore ]; then
  TEMPLATE_ONLY=$(
    sed -n '/^# template-only:start$/,/^# template-only:end$/p' .templatesyncignore |
      grep -v '^#' | grep -v '^[[:space:]]*$'
  )
fi

findings=$(mktemp)
trap 'rm -f "$findings"' EXIT

is_allowed() { printf '%s\n' "$ALLOW_MISSING" | grep -qxF "$1"; }

# テンプレート本体に実在するなら見逃さない。実在しない（＝派生プロジェクト）ときだけ
# 見逃す。存在を見ずに一覧だけで判定すると、コメントの言うことと実際の挙動がずれる。
#
# 「一覧に載っていて実在しない」がテンプレート本体で起きるのは、一覧を残したまま
# ファイルを消した場合。それは scripts/test-docs-downstream.sh が
# 「template-only の全てが実在すること」として別に検査する
is_template_only() {
  [ -n "$TEMPLATE_ONLY" ] || return 1
  [ -e "$1" ] && return 1

  printf '%s\n' "$TEMPLATE_ONLY" | grep -qxF "$1"
}

# **採用していない層への言及**は参照切れにしない。
#
# 同期されるドキュメントは全部入りの構成を前提に書いてあるため、mobile 層を持たない
# プロジェクトでも apps/mobile/… への言及が届く。これを参照切れとして数えると、
# テンプレートを取り込んだだけで docs-check が赤くなる。
#
# 見逃すのは**ここに挙げたワークスペースが丸ごと無いとき**だけ。
# 「apps/ 配下が無ければ全部見逃す」にすると、apps/wev/… のような綴り違いや
# ワークスペースのリネーム漏れまで黙って通る（検出したいものが検出できなくなる）。
# 層として外せるワークスペースは限られているので、一覧で持つほうが安全
OPTIONAL_WORKSPACES='
apps/mobile
apps/functions
'

is_absent_workspace() {
  case "$1" in
    apps/* | packages/*)
      # apps/mobile も apps/mobile/src/lib/sentry.ts も apps/mobile の有無で決める
      workspace=$(printf '%s' "$1" | cut -d/ -f1-2)

      printf '%s\n' "$OPTIONAL_WORKSPACES" | grep -qxF "$workspace" || return 1

      [ ! -e "$workspace" ]
      ;;
    *)
      # apps/ や packages/ ごと無い構成（設定だけを同期したプロジェクト）。
      # 1 段目が無いなら中の綴りは検査しようがない
      [ ! -e "${1%%/*}" ]
      ;;
  esac
}

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
# 空白入りのファイル名で単語分割されないよう NUL 区切りで読む
while IFS= read -r -d '' doc; do
  case "$doc" in
    .claude/skills/*) continue ;;
  esac

  checked=$((checked + 1))

  # --- 1. リポジトリ相対パスの言及 ---
  grep -nEo "(^|[^a-zA-Z0-9_/.-])($PREFIXES)/[a-zA-Z0-9_@./{}*<>-]+" "$doc" 2>/dev/null |
    while IFS=: read -r line match; do
      # 先頭に紛れ込んだ区切り文字と、文末の句読点・括弧を落とす
      path=$(printf '%s' "$match" | sed -E 's/^[^a-zA-Z._]+//; s/[.,)）。、:]+$//')

      is_literal "$path" || continue
      is_allowed "$path" && continue
      is_template_only "$path" && continue
      is_absent_workspace "$path" && continue
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
      is_template_only "$target" && continue
      is_absent_workspace "$target" && continue
      [ -e "$(dirname "$doc")/$target" ] && continue

      printf '%s:%s\tリンク先 %s\n' "$doc" "$line" "$target" >>"$findings"
    done
done < <(git ls-files -z '*.md')

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
    echo 'テンプレート本体にしか無いファイルなら .templatesyncignore の'
    echo 'template-only:start / :end の範囲に追加してください。'
  } >&2
  exit 1
fi

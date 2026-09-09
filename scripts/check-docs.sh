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

# 実在しなくてよいパス。gitignore されるファイル、必要になった時点で作るもの、
# そして「作ってはいけないもの」として名指しで説明しているパス
# （apps/web/.env.production → .claude/docs/architecture.md）
ALLOW_MISSING='
apps/functions/.env
apps/functions/.secret.local
apps/mobile/.env.local
apps/web/.env
apps/web/.env.local
apps/web/.env.production
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

# `.templatesyncignore` の除外のうち、template-only の範囲**以外**。こちらは
# 「派生プロジェクトが自分の版を持つファイル」で、同期では届かない（apps/ packages/、
# プロダクト固有ドキュメント、layers.json 等）。
SYNC_IGNORED=''

if [ -f .templatesyncignore ]; then
  TEMPLATE_ONLY=$(
    sed -n '/^# template-only:start$/,/^# template-only:end$/p' .templatesyncignore |
      grep -v '^#' | grep -v '^[[:space:]]*$'
  )

  # end が無いとレンジは末尾まで読む。ここでは削除側なので、そのぶん SYNC_IGNORED が
  # 減る（＝検査が厳しくなる）方向に転ぶ。緩む方向には壊れない
  SYNC_IGNORED=$(
    sed '/^# template-only:start$/,/^# template-only:end$/d' .templatesyncignore |
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

# テンプレート本体では、除外に載っているファイルも（ALLOW_MISSING のものを除いて）
# 全て実在する。そこで下の見逃しを切って**全部を検査する**モード。テンプレート本体でだけ立てる
# （scripts/test-docs-downstream.sh が立てて回す。派生プロジェクトへは同期されない）。
#
# 「実在するファイルの一覧から本体かどうかを推測する」書き方はやめた。派生プロジェクトは
# `.templatesyncignore` の template-only の範囲に自分の分を足すため、推測が外れる。
#
# 値は 1 だけを有効とする。CHECK_DOCS_STRICT=0 を「切っているつもり」で書いたときに
# 本体扱いになって派生の CI が赤くなるのを避ける
STRICT=${CHECK_DOCS_STRICT:-0}

# `.templatesyncignore` の除外に当たるか。
#
# 本来は gitignore 形式だが、ここで効かせるのは「完全一致」「ディレクトリ配下」
# 「.env* のような単純なグロブ」と `!` の否定だけ。`**` は扱わない（除外に使われていない）。
#
# `!` を素通しにすると危ない。否定は「除外から戻す＝同期される」意味なので、無視すると
# 親の除外（apps/）だけが残り、**同期されるパスまで見逃す**側に倒れる。gitignore と同じく
# 最後に一致した行を採る
matches_sync_ignore() {
  [ -n "$SYNC_IGNORED" ] || return 1

  # 1 = 除外に当たらない
  ignored=1

  while IFS= read -r entry; do
    [ -n "$entry" ] || continue

    hit=0

    case "$entry" in
      '!'*)
        hit=1
        entry=${entry#!}
        ;;
    esac

    entry=${entry%/}

    case "$1" in
      # shellcheck disable=SC2254 -- entry はグロブとして評価させる
      $entry | $entry/*) ignored=$hit ;;
    esac
  done <<EOF
$SYNC_IGNORED
EOF

  return "$ignored"
}

# 相対リンクを解決した結果をリポジトリ相対のパスに直す（./ と ../ を畳む）
normalize_path() {
  printf '%s' "$1" | awk -F/ '{
    n = 0
    for (i = 1; i <= NF; i++) {
      if ($i == "" || $i == ".") continue
      if ($i == "..") { if (n > 0) n--; continue }
      out[++n] = $i
    }
    s = ""
    for (i = 1; i <= n; i++) s = s (i > 1 ? "/" : "") out[i]
    print s
  }'
}

# **同期されるドキュメントが、同期されないパスを指している**場合は参照切れにしない。
#
# `apps/` `packages/` は `.templatesyncignore` で丸ごと除外されているため、
# テンプレートの参照実装（apps/web/src/lib/billing.ts 等）は派生へ届かない。
# 同じく workflow.md が指す planning.md / spec.md / roadmap.md も派生の持ち物で、
# Notion 等で管理していれば存在しない。どちらも**同期では埋められない**ので、
# 派生でこれを参照切れと数えると、取り込んだだけで docs-check が赤くなる（#338）。
#
# テンプレート本体は CHECK_DOCS_STRICT を立てて回すので、綴り違いや移動漏れは
# 今までどおり検出される（scripts/test-docs-downstream.sh）。
#
# ドキュメント側が除外に載っている（＝派生が自分で書き換えるもの。questions.md や
# CLAUDE.md）なら、書いたのは派生自身なので厳格に見る
is_unsynced_reference() {
  [ "$STRICT" = 1 ] && return 1

  matches_sync_ignore "$1" && return 1

  matches_sync_ignore "$2"
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
# 層として外せるワークスペースは限られているので、一覧で持つほうが安全。
#
# なお `.claude/docs/*.md` からの言及は、下の is_unsynced_reference のほうが先に
# （より広く）見逃すため、非 strict ではここまで来ない。ここが効くのは除外一覧に載る
# ドキュメント（README.md 等）からの言及と、CHECK_DOCS_STRICT=1 のとき
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
      is_unsynced_reference "$doc" "$path" && continue

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
      is_unsynced_reference "$doc" "$(normalize_path "$(dirname "$doc")/$target")" && continue

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
    echo '（.templatesyncignore で除外されたパスへの言及は、同期では埋められないものとして'
    echo '見逃します。CHECK_DOCS_STRICT を立てるとその見逃しも切れます）'
  } >&2
  exit 1
fi

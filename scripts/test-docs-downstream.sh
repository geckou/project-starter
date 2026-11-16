#!/usr/bin/env bash
set -u

# 「派生プロジェクトに同期された状態」で scripts/check-docs.sh が通るかを検査する。
#
# docs-check.yml と check-docs.sh は Template Sync で派生プロジェクトへ配られるが、
# それらが検査する .claude/docs/*.md は
#
#   1. .templatesyncignore の template-only:start / :end（テンプレート本体だけが持つ
#      スクリプト・ワークフロー）。この一覧が実態と合っていることもここで検査する
#   2. 採用していない層のファイル（apps/mobile/ など）
#
# を参照している。テンプレート本体では全ファイルが揃っているので CI は緑になり、
# **この壊れ方は派生でしか観測できない**（#322）。ここで本体側から検出する。
#
# やること: 追跡ファイルを一時ディレクトリへ複製し、上の 1 を消し、
# 2 を remove-layer.mjs で外してから check-docs.sh を回す。
#
# 注意: `.templatesyncignore` は本来 gitignore 形式だが、template-only の範囲に
# 書けるのは**リテラルなパスだけ**。ここも check-docs.sh も完全一致で突き合わせるため、
# `scripts/*.mjs` のようなパターンや `!` の否定は効かない。

cd "$(dirname "$0")/.."
REPO=$(pwd)

# 検査する構成。1 行が 1 構成で、値はその構成で外す層（空行 = 全部入り）。
# 「同期されたドキュメントは全部入り前提で書かれている」という前提が、
# どの構成でも成り立っていることを確かめる
REMOVE_LAYER_SETS=${REMOVE_LAYER_SETS:-"
:
billing:
billing mobile:
billing mobile functions:
billing mobile functions firebase:
"}

passed=0
failed=0

pass() {
  passed=$((passed + 1))
  echo "  [ok] $1"
}

fail() {
  failed=$((failed + 1))
  echo "  [NG] $1"
  if [ -n "${2:-}" ]; then
    echo "$2" | sed 's/^/       /'
  fi
}

WORK=$(mktemp -d) || exit 1

if [ -z "$WORK" ] || [ ! -d "$WORK" ]; then
  echo "作業ディレクトリを作れませんでした。" >&2
  exit 1
fi

trap 'rm -rf "$WORK"' EXIT

DERIVED="$WORK/derived"
mkdir -p "$DERIVED"

# 追跡ファイルを複製する（check-docs.sh は git ls-files で対象を集めるため、
# 複製先も git リポジトリにする）。未コミットの新規ファイルも含めるため
# --others を付ける。付けないと「新しく足したスクリプトを指すドキュメント」が
# 手元では落ち、コミットすると通る、という再現しにくい差が出る
git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' file; do
  mkdir -p "$DERIVED/$(dirname "$file")"
  cp "$file" "$DERIVED/$file"
done

git -C "$DERIVED" init -q .

echo "=== 派生プロジェクトでの docs-check ==="
echo ""

# --- 0. テンプレート本体を全部検査する ---
#
# check-docs.sh は「同期されるドキュメントが、同期されないパス（apps/ packages/、
# プロダクト固有ドキュメント）を指している」場合を参照切れに数えない。派生では
# 同期でその実体を埋められないため（#338）。ただしテンプレート本体では実体が揃って
# いるので、その見逃しを切って回す。これをやらないと、apps/ を指す言及の綴り違いや
# 移動漏れが本体でも黙って通る。
#
# 本体でだけ回せばよいので、本体しか持たないこのスクリプトに置く
if strict_output=$(CHECK_DOCS_STRICT=1 bash "$REPO/scripts/check-docs.sh" 2>&1); then
  pass "テンプレート本体では全ての言及が実在する（CHECK_DOCS_STRICT=1）"
else
  fail "テンプレート本体に参照切れがある（CHECK_DOCS_STRICT=1）" "$strict_output"
fi

echo ""

# --- 1. テンプレート本体だけが持つファイルを消す ---
TEMPLATE_ONLY=$(
  sed -n '/^# template-only:start$/,/^# template-only:end$/p' "$REPO/.templatesyncignore" |
    grep -v '^#' | grep -v '^[[:space:]]*$'
)

# end が無いと sed のレンジは**ファイル末尾まで**読み、除外が黙って増える。
# start が消えた場合は TEMPLATE_ONLY が空になるので下で拾える
if ! grep -qx '# template-only:end' "$REPO/.templatesyncignore"; then
  fail ".templatesyncignore に template-only:end が無い" \
    "終端が無いと、以降の行が全て「テンプレート本体だけが持つファイル」として扱われます"
elif [ -z "$TEMPLATE_ONLY" ]; then
  fail ".templatesyncignore の template-only:start / :end が読めない" \
    "マーカーが消えていると、この検査は何も消さずに通ってしまう"
else
  removed=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue

    if [ -e "$DERIVED/$file" ]; then
      rm -rf "$DERIVED/$file"
      removed=$((removed + 1))
    fi
  done <<EOF
$TEMPLATE_ONLY
EOF

  pass "テンプレート本体だけが持つファイルを ${removed} 件外した"

  # 一覧を残したままファイルを消すと、check-docs.sh はそのパスへの言及を
  # 「派生には無いだけ」とみなして見逃す。テンプレート本体には全て実在するはずなので、
  # ここで実在を突き合わせる（消したなら一覧からも消す）
  stale=$(
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      [ -e "$REPO/$file" ] || printf '%s\n' "$file"
    done <<EOF
$TEMPLATE_ONLY
EOF
  )

  if [ -z "$stale" ]; then
    pass "template-only に挙がっているファイルは全て実在する"
  else
    fail "template-only に、実在しないファイルが挙がっている" \
      "$(printf '%s\n' "$stale")
これらを指すドキュメントは、テンプレート本体でも参照切れとして検出されなくなります。
.templatesyncignore の template-only の範囲から消してください。"
  fi
fi

# 上の削除はマーカーの中身に従うだけなので、**マーカーへの入れ忘れは自力では気付けない**。
# 独立した規則で押さえる: `.templatesyncignore` に載っている scripts/ と
# .github/workflows/ のファイルは、派生プロジェクトが自分で作るものではなく
# 同期でしか届かない。つまり載っている時点で「テンプレート本体だけが持つ」ので、
# マーカーの外にあってはいけない。
#
# 見ているのは**テンプレート本体の** .templatesyncignore。派生プロジェクトが自分で
# 書き換えたファイル（scripts/deploy.sh 等）を足す先はマーカーの外で、そちらは
# この検査の対象にならない（→ .claude/docs/git-workflow.md「取り込み対象外にする」）
outside=$(
  grep -v '^#' "$REPO/.templatesyncignore" | grep -v '^[[:space:]]*$' |
    grep -E '^(scripts/|\.github/workflows/)' |
    while IFS= read -r entry; do
      printf '%s\n' "$TEMPLATE_ONLY" | grep -qxF "$entry" || printf '%s\n' "$entry"
    done
)

if [ -z "$outside" ]; then
  pass "同期されない scripts/ と .github/workflows/ は全て template-only の範囲にある"
else
  fail "template-only の範囲外に、同期されないファイルがある" \
    "$(printf '%s\n' "$outside")
これらを指すドキュメントは派生で参照切れになります。
.templatesyncignore の template-only:start / :end の中へ移してください。"
fi

# /init-project の §3.6 は、同じファイルを新規の派生から消す手順（rm -f の一覧）を
# 別に持っている。Use this template はファイルを丸ごと複製するので、一覧から漏れた
# ファイルは派生に残り、以後 Template Sync で更新も削除もされない。消し忘れは
# check-docs.sh でも検出されない（template-only かつ実在しないパスは見逃す作り）ため、
# 2 つの一覧のズレをここで検出する（#202 / #348）
INIT_SKILL="$REPO/.claude/skills/init-project/SKILL.md"

if [ ! -f "$INIT_SKILL" ]; then
  fail "/init-project の手順書が無い" "$INIT_SKILL"
else
  # §3.6 の見出しから次の見出しまでの、rm -f とその継続行に並ぶパスを拾う
  listed=$(
    awk '
      /^### 3\.6\./ { in_section = 1; next }
      in_section && /^##/ { exit }
      !in_section { next }
      /^rm -f / { in_rm = 1; sub(/^rm -f /, "") }
      in_rm {
        continued = ($0 ~ /\\$/)
        sub(/[[:space:]]*\\$/, "")
        count = split($0, words, /[[:space:]]+/)
        for (i = 1; i <= count; i++) if (words[i] != "") print words[i]
        if (!continued) in_rm = 0
      }
    ' "$INIT_SKILL"
  )

  if [ -z "$listed" ]; then
    fail "/init-project の §3.6 から rm -f の一覧を読めない" \
      "見出し（### 3.6.）か rm -f の書き方が変わっていると、この検査は何も比べずに通ってしまう"
  else
    not_removed=$(
      printf '%s\n' "$TEMPLATE_ONLY" | while IFS= read -r file; do
        [ -n "$file" ] || continue
        printf '%s\n' "$listed" | grep -qxF "$file" || printf '%s\n' "$file"
      done
    )
    not_ignored=$(
      printf '%s\n' "$listed" | while IFS= read -r file; do
        [ -n "$file" ] || continue
        printf '%s\n' "$TEMPLATE_ONLY" | grep -qxF "$file" || printf '%s\n' "$file"
      done
    )

    if [ -z "$not_removed" ]; then
      pass "template-only のファイルは全て /init-project の rm -f 一覧に載っている"
    else
      fail "template-only にあって /init-project の rm -f 一覧に無いファイルがある" \
        "$(printf '%s\n' "$not_removed")
新規の派生に残り、Template Sync で更新も削除もされない凍結ファイルになります。
.claude/skills/init-project/SKILL.md の §3.6 の rm -f に足してください。"
    fi

    if [ -z "$not_ignored" ]; then
      pass "/init-project の rm -f 一覧は全て template-only の範囲にある"
    else
      fail "/init-project の rm -f 一覧にあって template-only に無いファイルがある" \
        "$(printf '%s\n' "$not_ignored")
消しても次の Template Sync で戻ってきます。
.templatesyncignore の template-only:start / :end の中へ足してください。"
    fi
  fi
fi

echo ""

# --- 2. 構成ごとに層を外して check-docs.sh を回す ---
printf '%s\n' "$REMOVE_LAYER_SETS" | while IFS= read -r entry; do
  case "$entry" in
    *:) layers=${entry%:} ;;
    *) continue ;;
  esac

  variant=${layers:-"（全部入り）"}
  target="$WORK/variant"
  rm -rf "$target"
  cp -R "$DERIVED" "$target"

  if [ -n "$layers" ]; then
    # shellcheck disable=SC2086
    if ! (cd "$target" && node scripts/remove-layer.mjs $layers >"$WORK/remove.log" 2>&1); then
      fail "層を外せなかった（${variant}）" "$(cat "$WORK/remove.log")"
      continue
    fi
  fi

  git -C "$target" add -A >/dev/null 2>&1

  if output=$(cd "$target" && bash scripts/check-docs.sh 2>&1); then
    pass "${variant} で check-docs.sh が通る"
  else
    fail "${variant} で check-docs.sh が落ちる（#322 の再発）" "$output"
  fi
done >"$WORK/results"

cat "$WORK/results"

# ループはパイプ越しのサブシェルで回るため、その中の増減は親に残らない。
# 結果ファイルから数え直して足す（上書きすると、ループの前に出た失敗が消える）
failed=$((failed + $(grep -c '^  \[NG\]' "$WORK/results" | tr -d ' ')))
passed=$((passed + $(grep -c '^  \[ok\]' "$WORK/results" | tr -d ' ')))

echo ""
echo "=== 結果: ${passed} 件成功 / ${failed} 件失敗 ==="

[ "$failed" -eq 0 ]

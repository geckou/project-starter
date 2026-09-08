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
# マーカーの外にあってはいけない
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

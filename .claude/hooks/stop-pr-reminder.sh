#!/usr/bin/env sh
# Stop フック: push 済みの作業に PR が無いまま終わるのを止める。
#
# CLAUDE.md「PR は出す、マージは人が決める」は文章だけで支えられていて、
# push しただけで終えると、作業が「レビューできない場所」に置かれたまま残る。
# 手元の未コミットと違って外からは見えないので、気付くのは次のセッションになる。
#
# PR の有無は gh を叩かないと分からない。他の Stop フックと違いネットワークに
# 依存するため、gh が無い / 未認証 / API が失敗したときは何もせず終了する
# （「無ければ既定値で動く」方針。→ CLAUDE.md「スタック依存の値は config.sh に置く」）。

command -v jq >/dev/null 2>&1 || exit 0

hook_dir=$(dirname "$0")
[ -f "$hook_dir/config.sh" ] && . "$hook_dir/config.sh"

remote=${HOOK_PR_REMOTE:-origin}
base=${HOOK_PR_BASE_BRANCH:-production}

input=$(cat)

# フック起因の継続中でも、このフック自身がまだブロックしていなければ判定する
# （stop-questions-reminder.sh と同じ扱い。→ #244）
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
session=$(printf '%s' "$input" | jq -r '.session_id // empty')
marker=''
[ -n "$session" ] && marker="${TMPDIR:-/tmp}/claude-stop-pr-$session"

if [ "$active" = "true" ]; then
  [ -z "$marker" ] && exit 0
  [ -f "$marker" ] && exit 0
fi

pass() {
  [ -n "$marker" ] && rm -f "$marker"
  exit 0
}

block() {
  [ -n "$marker" ] && : > "$marker"
  exit 2
}

git rev-parse --git-dir >/dev/null 2>&1 || pass

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || pass
[ -n "$branch" ] || pass

# 分離 HEAD には push 先が無い。既定ブランチと release/* は PR の流れが別
# （release/* への push は staging へのデプロイで、production への PR は後から出す）
case $branch in
  (HEAD | "$base" | release/*) pass ;;
esac

# push されていなければ、まだ「レビューできない場所」に置かれてはいない
git rev-parse --verify --quiet "refs/remotes/$remote/$branch" >/dev/null 2>&1 || pass

# 既定ブランチへ未マージのコミットが push 済みか
ahead=$(git rev-list --count "$remote/$base..$remote/$branch" 2>/dev/null) || pass
[ -n "$ahead" ] && [ "$ahead" -gt 0 ] 2>/dev/null || pass

command -v gh >/dev/null 2>&1 || pass

# PR を探すリポジトリは、上で比べた remote の URL から決める。gh に任せると
# gh repo set-default の設定先（別のリポジトリでもありうる）を見に行き、
# 「比べた先と PR を探した先が違う」状態で通過 / ブロックしてしまう
remote_url=$(git remote get-url "$remote" 2>/dev/null) || pass
repo=$(printf '%s' "$remote_url" |
  sed -e 's#^git@[^:]*:#/#' -e 's#^ssh://[^/]*/#/#' -e 's#^[a-z]*://[^/]*/#/#' \
    -e 's#\.git$##' -e 's#^/##')

# owner/repo の形にならないもの（ローカルのパス等）は判定できないので何もしない
case $repo in
  (*/*/*) pass ;;
  (*/*) ;;
  (*) pass ;;
esac

open_prs=$(gh pr list --repo "$repo" --head "$branch" --state open \
  --json number --jq 'length' 2>/dev/null) || pass
[ -n "$open_prs" ] || pass
[ "$open_prs" -gt 0 ] 2>/dev/null && pass

echo "'$branch' は $remote へ push 済み（$remote/$base へ未マージのコミット ${ahead} 件）ですが、open な PR がありません。CLAUDE.md「PR は出す、マージは人が決める」に従い、PR を作成してから終了してください（DoD とセルフレビューを通したうえで、何を確認してほしいかを本文に書く）。まだ PR にできない状態なら、その理由をユーザーに伝えてください。" >&2
block

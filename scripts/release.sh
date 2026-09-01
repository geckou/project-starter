#!/usr/bin/env bash
# 第0層の設定パッケージ（packages/*-config）を npm へ公開する。
#
#   yarn release <パッケージのディレクトリ名>
#
# タグ（<ディレクトリ名>@<バージョン>。例: eslint-config@0.1.0）を production の
# 先頭に打って push するだけで、公開は .github/workflows/publish.yml が行う。
#
# **バージョンを上げるのはこのスクリプトではない。** このリポジトリは production への
# 直接 push を禁じている（CLAUDE.md「マージルール」）ため、version の変更は通常の PR で
# 入れる。マージ後にこのスクリプトでタグを打つ、という2段構えにしている。
#
#   1. packages/<パッケージ>/package.json の version を上げる PR を出してマージする
#   2. production を pull して yarn release <パッケージ>
set -euo pipefail

PACKAGE="${1:-}"

if [ -z "$PACKAGE" ]; then
  echo "パッケージを指定してください: yarn release <パッケージのディレクトリ名>" >&2
  exit 1
fi

PACKAGE_DIR="packages/$PACKAGE"

if [ ! -f "$PACKAGE_DIR/package.json" ]; then
  echo "$PACKAGE_DIR が存在しません。" >&2
  exit 1
fi

if [ "$(node -p "require('./$PACKAGE_DIR/package.json').private === true")" = "true" ]; then
  echo "$PACKAGE_DIR は private です（公開対象ではありません）。" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "コミットされていない変更があります。先にコミットしてください。" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$BRANCH" != "production" ]; then
  echo "production ブランチで実行してください（現在: $BRANCH）" >&2
  exit 1
fi

git pull --ff-only origin production

VERSION="$(node -p "require('./$PACKAGE_DIR/package.json').version")"
TAG="$PACKAGE@$VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "タグ $TAG は既にローカルに存在します。version を上げてください。" >&2
  exit 1
fi

if [ -n "$(git ls-remote --tags origin "refs/tags/$TAG")" ]; then
  echo "タグ $TAG は既に origin に存在します。version を上げてください。" >&2
  exit 1
fi

git tag "$TAG"
git push origin "$TAG"

echo "[done] $TAG を push しました。publish ワークフローが npm へ公開します。"
echo "       既に公開済みのバージョンなら publish はスキップされます。"

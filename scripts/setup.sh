#!/bin/bash
set -e

echo "=== Geckou Project Starter - Setup ==="
echo ""

# .firebaserc の確認
if grep -q "your-project-develop" .firebaserc 2>/dev/null; then
  echo "[todo] Firebase プロジェクト ID を設定してください"
  echo ""
  echo "  3つの Firebase プロジェクトを作成してください:"
  echo "  - develop:    開発環境（日常の開発）"
  echo "  - staging:    ステージング環境（リリース前テスト）"
  echo "  - production: 本番環境"
  echo ""

  read -p "develop の Project ID (後で設定する場合は Enter): " DEV_ID
  read -p "staging の Project ID (後で設定する場合は Enter): " STG_ID
  read -p "production の Project ID (後で設定する場合は Enter): " PROD_ID

  if [[ "$OSTYPE" == "darwin"* ]]; then
    [ -n "$DEV_ID" ] && sed -i '' "s/your-project-develop/$DEV_ID/g" .firebaserc
    [ -n "$STG_ID" ] && sed -i '' "s/your-project-staging/$STG_ID/g" .firebaserc
    [ -n "$PROD_ID" ] && sed -i '' "s/your-project-production/$PROD_ID/g" .firebaserc
  else
    [ -n "$DEV_ID" ] && sed -i "s/your-project-develop/$DEV_ID/g" .firebaserc
    [ -n "$STG_ID" ] && sed -i "s/your-project-staging/$STG_ID/g" .firebaserc
    [ -n "$PROD_ID" ] && sed -i "s/your-project-production/$PROD_ID/g" .firebaserc
  fi

  echo "[done] .firebaserc を更新しました"
else
  echo "[skip] .firebaserc は設定済みです"
fi

echo ""

# 環境別 .env ファイルの作成
for ENV in develop staging production; do
  if [ -f ".env.${ENV}" ]; then
    echo "[skip] .env.${ENV} は既に存在します"
  else
    cp .env.example ".env.${ENV}"
    echo "[done] .env.${ENV} を作成しました"
  fi
done

echo ""
echo "  → 各 .env.{環境名} に Firebase の設定値を入力してください"
echo "  → Firebase Console: https://console.firebase.google.com"

echo ""

# デフォルト環境の設定
if [ ! -f .env.local ]; then
  cp .env.develop .env.local 2>/dev/null || cp .env.example .env.local
  echo "[done] .env.local を作成しました（develop 環境）"
else
  echo "[skip] .env.local は既に存在します"
fi

echo ""

# Node.js バージョンチェック
REQUIRED_NODE=20
CURRENT_NODE=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v')
if [ -z "$CURRENT_NODE" ]; then
  echo "[warn] Node.js がインストールされていません"
  echo "  → Node.js $REQUIRED_NODE 以上をインストールしてください"
elif [ "$CURRENT_NODE" -lt "$REQUIRED_NODE" ]; then
  echo "[warn] Node.js v$CURRENT_NODE が検出されました（v$REQUIRED_NODE 以上が必要）"
  echo "  → nvm use $REQUIRED_NODE または nvm install $REQUIRED_NODE"
else
  echo "[ok] Node.js v$CURRENT_NODE"
fi

# yarn チェック
if command -v yarn &> /dev/null; then
  echo "[ok] yarn $(yarn -v)"
else
  echo "[warn] yarn がインストールされていません"
  echo "  → npm install -g yarn"
fi

# Firebase CLI チェック
if command -v firebase &> /dev/null; then
  echo "[ok] firebase $(firebase --version)"
else
  echo "[warn] Firebase CLI がインストールされていません"
  echo "  → npm install -g firebase-tools"
fi

echo ""

# GitHub ブランチ保護ルール設定
setup_branch_protection() {
  # gh CLI の存在チェック
  if ! command -v gh &> /dev/null; then
    echo "[skip] GitHub CLI (gh) がインストールされていません"
    echo "  → brew install gh でインストール後、手動でブランチ保護を設定してください"
    echo "  → https://docs.github.com/ja/repositories/configuring-branches-and-merges-in-your-repository/managing-a-branch-rule/managing-a-branch-protection-rule"
    return
  fi

  # gh の認証チェック
  if ! gh auth status &> /dev/null; then
    echo "[skip] GitHub CLI が未認証です"
    echo "  → gh auth login で認証後、再度 yarn setup を実行してください"
    return
  fi

  # リモートURLからリポジトリを検出
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
  if [ -z "$REMOTE_URL" ]; then
    echo "[skip] git remote origin が設定されていません"
    return
  fi

  # owner/repo を抽出（BSD sed は非貪欲量指定子 .+? を解釈できないため2段置換）
  REPO=$(echo "$REMOTE_URL" | sed -E 's#.*github\.com[:/]##; s#\.git$##')
  if [ -z "$REPO" ]; then
    echo "[skip] GitHub リポジトリを検出できませんでした"
    return
  fi

  echo "リポジトリ: $REPO"

  # production ブランチの存在チェック
  if ! gh api "repos/$REPO/branches/production" &> /dev/null; then
    echo "[skip] production ブランチがまだ存在しません"
    echo "  → production ブランチを作成後、再度 yarn setup を実行してください"
    return
  fi

  # 既存の保護ルールチェック
  if gh api "repos/$REPO/branches/production/protection" &> /dev/null 2>&1; then
    echo "[skip] production ブランチの保護ルールは設定済みです"
    return
  fi

  read -p "production ブランチに保護ルールを設定しますか？ (Y/n): " PROTECT
  if [ "$PROTECT" = "n" ] || [ "$PROTECT" = "N" ]; then
    echo "[skip] ブランチ保護の設定をスキップしました"
    return
  fi

  # ブランチ保護ルールを設定
  # （set -e 環境下でも失敗時に else 節へ到達できるよう if で直接判定する）
  if gh api "repos/$REPO/branches/production/protection" \
    --method PUT \
    --input - <<'JSON' > /dev/null
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
  then
    echo "[done] production ブランチに保護ルールを設定しました"
    echo "  - CI (ci ジョブ) パス必須 (strict: true)"
    echo "  - PR 必須 + 1名以上のレビュー承認"
    echo "  - 直接 push 禁止"
    echo "  - force push 禁止"
    echo "  - ブランチ削除禁止"
  else
    echo "[error] ブランチ保護の設定に失敗しました"
    echo "  → リポジトリの Admin 権限があるか確認してください"
  fi
}

setup_branch_protection

echo ""

# 依存インストール
read -p "yarn install を実行しますか？ (Y/n): " INSTALL
if [ "$INSTALL" != "n" ] && [ "$INSTALL" != "N" ]; then
  yarn install
  echo ""
  echo "[done] 依存関係をインストールしました"

  # packages/shared の dist を生成（tailwind.config.js などの Node ランタイム
  # から `require('@geckou/shared/theme')` を解決可能にするため）
  yarn workspace @geckou/shared build
  echo "[done] packages/shared をビルドしました"
fi

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "次のステップ:"
echo "  1. .env.develop に Firebase (develop) の設定値を入力"
echo "  2. yarn env:develop で develop 環境に切り替え"
echo "  3. yarn dev:web で Web 開発サーバーを起動"
echo "  4. yarn firebase:emulators で Firebase エミュレーターを起動"
echo ""
echo "環境の切り替え:"
echo "  yarn env:develop     → 開発環境"
echo "  yarn env:staging     → ステージング環境"
echo "  yarn env:production  → 本番環境"
echo ""
echo "デプロイ:"
echo "  yarn deploy:develop     → develop にデプロイ"
echo "  yarn deploy:staging     → staging にデプロイ"
echo "  yarn deploy:production  → production にデプロイ"
echo ""

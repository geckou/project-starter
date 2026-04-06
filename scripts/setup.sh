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

# 依存インストール
read -p "yarn install を実行しますか？ (Y/n): " INSTALL
if [ "$INSTALL" != "n" ] && [ "$INSTALL" != "N" ]; then
  yarn install
  echo ""
  echo "[done] 依存関係をインストールしました"
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

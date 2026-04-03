#!/bin/bash
set -e

echo "=== Geckou Project Starter - Setup ==="
echo ""

# .env.local の作成
if [ -f .env.local ]; then
  echo "[skip] .env.local は既に存在します"
else
  cp .env.example .env.local
  echo "[done] .env.local を作成しました"
  echo "  → Firebase の設定値を .env.local に入力してください"
  echo "  → Firebase Console: https://console.firebase.google.com"
fi

echo ""

# .firebaserc の確認
if grep -q "your-firebase-project-id" .firebaserc 2>/dev/null; then
  echo "[todo] .firebaserc の project ID を設定してください"
  echo "  → Firebase Console > Project Settings > Project ID"
  echo ""
  read -p "Firebase Project ID を入力（後で設定する場合は Enter）: " PROJECT_ID
  if [ -n "$PROJECT_ID" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/your-firebase-project-id/$PROJECT_ID/" .firebaserc
    else
      sed -i "s/your-firebase-project-id/$PROJECT_ID/" .firebaserc
    fi
    echo "[done] .firebaserc を更新しました: $PROJECT_ID"
  else
    echo "[skip] 後で .firebaserc を手動で編集してください"
  fi
else
  echo "[skip] .firebaserc は設定済みです"
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
echo "  1. .env.local に Firebase の設定値を入力"
echo "  2. yarn dev:web で Web 開発サーバーを起動"
echo "  3. yarn firebase:emulators で Firebase エミュレーターを起動"
echo ""

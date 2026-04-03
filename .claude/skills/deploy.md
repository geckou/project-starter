---
name: deploy
description: Firebase / Vercel へのデプロイ手順をガイドする
---

# deploy

デプロイ対象を確認し、手順をガイドする。

## デプロイ先一覧

| アプリ            | デプロイ先              | コマンド                                    |
| ----------------- | ----------------------- | ------------------------------------------- |
| Web (Next.js)     | Vercel                  | Vercel ダッシュボードまたは `vercel deploy` |
| Web (Next.js)     | Firebase Hosting        | `yarn firebase:deploy:hosting`              |
| Functions         | Firebase                | `yarn firebase:deploy:functions`            |
| Mobile            | App Store / Google Play | `eas build` + `eas submit`                  |
| Firestore Rules   | Firebase                | `firebase deploy --only firestore:rules`    |
| Firestore Indexes | Firebase                | `firebase deploy --only firestore:indexes`  |
| 全部 (Firebase)   | Firebase                | `yarn firebase:deploy`                      |

## 手順

1. ユーザーにデプロイ対象を確認する
2. 以下のチェックを行う:
   - `yarn type-check` が通るか
   - `yarn lint` が通るか
   - `yarn test` が通るか
   - `yarn build` が通るか
3. 問題があれば修正を提案する
4. デプロイコマンドを案内する

## デプロイ前チェック

### Firebase 全般

```bash
# .firebaserc のプロジェクト ID が正しいか確認
cat .firebaserc

# ログイン状態の確認
firebase login:list
```

### Functions

```bash
# ビルドが通るか確認
yarn build:functions

# 環境変数が設定されているか確認
# Firebase Functions の環境変数は Firebase コンソールまたは .env で管理
```

### Firestore Rules

```bash
# ルールのデプロイ（データには影響しない）
firebase deploy --only firestore:rules

# インデックスのデプロイ
firebase deploy --only firestore:indexes
```

### Web (Vercel)

```bash
# Vercel CLI でデプロイ
vercel deploy

# プロダクションデプロイ
vercel deploy --prod
```

### Web (Firebase Hosting)

```bash
# ビルド
yarn build --filter=@geckou/web

# デプロイ
yarn firebase:deploy:hosting
```

### Mobile (Expo / EAS)

```bash
# iOS ビルド
eas build --platform ios

# Android ビルド
eas build --platform android

# ストアへ提出
eas submit --platform ios
eas submit --platform android
```

## ルール

- デプロイ前に必ず型チェック・リント・テストを実行する
- 本番環境の環境変数が正しく設定されているか確認する
- Firestore Rules の変更は本番データに即座に影響するため特に注意する
- `--force` オプションは使わない

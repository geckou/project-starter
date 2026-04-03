---
name: new-app
description: モノレポに新しいアプリを追加する
---

# new-app

`apps/` 配下に新しいアプリケーションを追加する。

## 手順

1. ユーザーにアプリ名と種類を確認する:
   - **Next.js**: Web アプリ（`apps/web/` をベースにコピー）
   - **Expo**: モバイルアプリ（`apps/mobile/` をベースにコピー）
   - **その他**: 要件に応じて構成
2. ディレクトリを作成し、ベースのアプリからファイルをコピーする
3. `package.json` の `name` を `@geckou/<app-name>` に変更する
4. 不要なコードを削除し、最小限の状態にする
5. `yarn install` の実行を案内する

## 実行するコマンド

```bash
# 例: Next.js アプリ「admin」を追加
cp -r apps/web apps/admin
```

## コピー後に変更するファイル

### package.json

```json
{
  "name": "@geckou/<app-name>",
  "version": "0.1.0",
  "private": true
}
```

### src/app/layout.tsx

- `metadata` の `title` と `description` をアプリに合わせて変更

### src/app/page.tsx

- 最小限の内容に置き換え

## ルール

- `@geckou/shared` への依存は残す
- Tailwind CSS の設定（`tailwind.config.ts`）はそのまま共有テーマを使う
- Firebase の設定もそのまま使える（同じプロジェクトの場合）
- 別の Firebase プロジェクトを使う場合は `.env` を分ける
- コピー元にあるテストやサンプルコードは削除する
- ルートの `package.json` に便利スクリプトを追加する:
  ```json
  "dev:<app-name>": "turbo dev --filter=@geckou/<app-name>"
  ```

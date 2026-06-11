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

## Web アプリ（Next.js）を複数置く場合

`next` / `react` / `react-dom` / `@types/react` / `@types/react-dom` はルートの
`devDependencies` に集約済み。全 web アプリが同一バージョン範囲を宣言するため、
yarn がルートの単一コピーに dedupe する。これにより:

- `node_modules/.bin/next` がルートの単一 next を指す
- firebase-tools の framework デプロイが別 web アプリの next を誤用しない
- React ランタイムと `react-dom` が同一コピーで解決される

新しい web アプリを追加しても、コピー元（`apps/web`）と同じ react エコシステムの
バージョン範囲を保てば追加設定は不要。範囲を変えると重複コピーが生じるため変えない。

mobile（React Native / react@18 系）はルートの `package.json` の
`workspaces.nohoist`（`@geckou/mobile-*/**`）で隔離済み。web の react@19 系と干渉しない。

### Firebase Hosting に追加 web アプリを載せる場合

`firebase.json` の `hosting` を配列にし、各アプリに `target` を割り当てる:

```jsonc
"hosting": [
  { "target": "web",   "source": "apps/web",   "frameworksBackend": { "region": "asia-northeast1" } },
  { "target": "admin", "source": "apps/admin", "frameworksBackend": { "region": "asia-northeast1" } }
]
```

`.firebaserc` の `targets` で `target` と Hosting サイト ID を紐付ける。
`scripts/deploy.sh` は framework Hosting ターゲットを 1 つずつ `firebase deploy` する
（複数同梱は Next アダプタがハングするため）。`target` を設定すれば自動で個別デプロイされる。

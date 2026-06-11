---
name: deploy
description: マルチ環境（develop / staging / production）への Firebase デプロイ手順をガイドする
---

# deploy

デプロイ対象の環境を確認し、`scripts/deploy.sh` ベースのデプロイを実行・ガイドする。

## 環境とコマンド

| 環境       | コマンド                 | 用途                     |
| ---------- | ------------------------ | ------------------------ |
| develop    | `yarn deploy:develop`    | 開発確認用               |
| staging    | `yarn deploy:staging`    | リリース前検証           |
| production | `yarn deploy:production` | 本番（release/hotfix 後）|

部分デプロイ: `bash scripts/deploy.sh <env> --only functions` / `--only hosting`

Mobile は EAS 経由（`eas build` + `eas submit`）で、deploy.sh の対象外。

## deploy.sh がやること

1. `scripts/use-env.sh <env>` で `.env.local`（ルート + `apps/web/`）と Firebase プロジェクトを切り替え
2. `type-check` / `lint` / `test` / `build` の事前チェック
3. workspace 依存（`@geckou/*`）を package.json から一時削除（Cloud Build が npm registry から取得しようとして失敗するため。終了時に自動復元）
4. functions / firestore をデプロイ後、framework hosting をターゲットごとに個別デプロイ（複数同梱だと next build がハングするため）

`--force` フラグは上記の理由で意図的に使用している（削除しないこと）。

## 手順

1. ユーザーにデプロイ対象の環境を確認する
2. 前提を確認する:
   - `.env.<env>` が存在するか（なければ `.env.example` からコピーして値を埋める）
   - `firebase login:list` でログイン済みか
   - `firebase experiments:enable webframeworks` が有効か（初回のみ必要）
   - production の場合: 現在のブランチが `production` か（release/hotfix マージ後のデプロイが原則）
3. `yarn deploy:<env>` を実行する
4. 失敗したら `/troubleshoot` の手順で診断する

## CI 経由のデプロイ

`.github/workflows/deploy.yml` が push トリガーで同じ `scripts/deploy.sh` を実行する:

| ブランチ                  | デプロイ先 |
| ------------------------- | ---------- |
| feat/fix/refactor/test/** | develop    |
| release/** / hotfix/**    | staging    |
| production                | production |

CI には Secrets として `FIREBASE_SERVICE_ACCOUNT`（サービスアカウント JSON）と `ENV_FILE_<ENV>`（.env の内容）が必要。

## ルール

- デプロイ前チェック（型・lint・テスト・ビルド）は deploy.sh が自動実行する。スキップしない
- Firestore Rules の変更は本番データに即座に影響するため、production へのデプロイ前に差分を必ず確認する
- 本番環境の `.env.production` の値が最新か確認する

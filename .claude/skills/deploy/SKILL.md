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
カンマ区切りで複数指定もできる（`--only functions,hosting`）。

Mobile は EAS 経由（`eas build` + `eas submit`）で、deploy.sh の対象外。

## deploy.sh がやること

1. `scripts/use-env.sh <env>` で `.env.local`（ルート + `apps/web/` + `apps/mobile/`）と Firebase プロジェクトを切り替え
2. `type-check` / `lint` / `test` / `build` の事前チェック（`SKIP_CHECKS=1` を渡したときのみ省略。CI 専用の抜け道で、ローカルでは使わない）
3. workspace 依存（`@geckou/*`）を package.json から一時削除（Cloud Build が npm registry から取得しようとして失敗するため。終了時に自動復元）
4. functions / firestore → storage → framework hosting の順にデプロイ
   - hosting は複数同梱だと next build がハングするため、ターゲットごとに個別デプロイする
   - storage は Cloud Storage 未有効化時に失敗しうるため個別に実行し、失敗時は対処方法を表示する
   - storage は `firebase.json` が `storage` を宣言している場合のみ対象になる。Cloud Storage を使わないプロジェクトは `firebase.json` から `storage` を削除する

`--force` フラグは上記の理由で意図的に使用している（削除しないこと）。

production へのデプロイは `production` ブランチからのみ実行できるガードが deploy.sh に入っている。
どうしても他ブランチから実行する必要がある場合のみ `FORCE_DEPLOY=1 yarn deploy:production` で回避できる。

## 手順

1. ユーザーにデプロイ対象の環境を確認する
2. 前提を確認する:
   - `.env.<env>` が存在するか（なければ `.env.example` からコピーして値を埋める）
   - `firebase login:list` でログイン済みか
   - production の場合: 現在のブランチが `production` か（deploy.sh がガードしている。release/hotfix マージ後のデプロイが原則）

   `firebase experiments:enable webframeworks` は deploy.sh が自動実行するため手動での有効化は不要。
3. `yarn deploy:<env>` を実行する
4. 失敗したら `/troubleshoot` の手順で診断する

## CI 経由のデプロイ

`.github/workflows/deploy.yml` が push トリガーで同じ `scripts/deploy.sh` を実行する:

| ブランチ               | デプロイ先 |
| ---------------------- | ---------- |
| release/** / hotfix/** | staging    |
| production             | production |

develop は CI から自動デプロイしない（複数人の feat/* push が互いに上書きし合うため）。各自 `yarn deploy:develop` で手動デプロイする。

CI には Secrets として `FIREBASE_SERVICE_ACCOUNT`（サービスアカウント JSON）と `ENV_FILE_STAGING` / `ENV_FILE_PRODUCTION`（.env の内容）が必要。

### Actions 分の節約

ワークフローは 1 ジョブ構成で、チェックとデプロイを同じジョブで実行する（`setup-node` と `yarn install` の二重実行と、ジョブ単位の最低課金 1 分を避けるため）。
チェックはワークフロー側の step で実行し、`deploy.sh` には `SKIP_CHECKS=1` を渡して二重実行を防いでいる。

デプロイ対象は push の変更差分から判定し、必要なターゲットだけを `--only` で渡す。
`apps/web/` だけの変更なら hosting だけ、`firestore.rules` だけなら firestore だけがデプロイされる。
影響範囲を特定できないファイル（ルート設定・`packages/` 等）が含まれる場合は全ターゲットをデプロイする。

**デプロイが失敗した回の変更は、次の push では再送されない。** 取りこぼしたときは
`workflow_dispatch`（Actions タブから手動実行）で全ターゲットをデプロイして回復する。

## ルール

- デプロイ前チェック（型・lint・テスト・ビルド）は deploy.sh が自動実行する。ローカルでスキップしない（`SKIP_CHECKS=1` は CI 専用。CI ではワークフロー側の step が同じチェックを実行済み）
- Firestore / Storage Rules の変更は本番データに即座に影響するため、production へのデプロイ前に差分を必ず確認する
- ルールを変更したら `yarn test:rules` を実行する（Firestore / Storage の両方を検証する）
- 本番環境の `.env.production` の値が最新か確認する

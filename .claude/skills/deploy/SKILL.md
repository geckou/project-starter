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

⚠️ **`yarn firebase:deploy` / `yarn firebase:deploy:hosting` は `deploy.sh` を通らない。**
事前チェックも環境ごとの絞り込みもせず、`apps/web/.env.local` の退避もしない。そのため
`firebase.json` に hosting ターゲットが複数ある構成では**全ターゲットに配り**（今アクティブな
環境のビルドが別の環境のサイトにも出る）、**サーバー秘密が SSR 関数へ同梱される**。
デプロイは `yarn deploy:<環境名>` を使う。

## deploy.sh がやること

1. `scripts/use-env.sh <env>` で `.env.local`（ルート + `apps/web/` + `apps/mobile/`）と Firebase プロジェクトを切り替え
   - あわせて `apps/web/.env` を生成する（`WEB_SSR_ENV_KEYS` + `NEXT_PUBLIC_*`）。
     framework-backed hosting では**このファイルの内容が SSR 関数の環境変数**になる。
     SSR で読むサーバー専用の変数を足したら `WEB_SSR_ENV_KEYS` にも追記する
     （→ `.claude/docs/architecture.md`）
2. `type-check` / `lint` / `test` / `build` の事前チェック（`SKIP_CHECKS=1` を渡したときのみ省略。CI 専用の抜け道で、ローカルでは使わない）
3. workspace 依存（`@geckou/*`）を package.json から一時削除（Cloud Build が npm registry から取得しようとして失敗するため。終了時に自動復元）
4. `apps/web/.env.*` を退避（framework-backed hosting はこれらを関数のソースへ同梱するため、全文コピーの `.env.local` が入るとサーバー秘密まで載る。終了時に自動復元。中断で取りこぼしても次回のデプロイで戻す）
5. **既定のデプロイ対象を `.firebaserc` から導出する**（`--only` 未指定のとき）
   - 複数の環境が同じ Firebase プロジェクト ID を指す構成（1 プロジェクトに環境を
     相乗りさせる → `.claude/docs/git-workflow.md`）では、`functions` / `firestore` /
     `storage` は環境で分けられない。**共有する環境のうち最も本番側の 1 つ**
     （通常は `production`）以外では、既定のデプロイ対象から外す
   - 同じ条件で、`firebase.json` の `hosting` に**その環境名のターゲット（`target` / `site`）が
     無い**場合は `hosting` も外す（配ると他の環境 = 本番のサイトを上書きするため）。
     配る対象が全て外れた環境では、配るものが無いのでエラーで終了する
     （配る側 = 通常 `production` はこの絞り込みを受けない）
   - 外した対象は `--only` で明示すれば配れる。`hosting` も止めはしないが、他の環境の
     サイトを上書きするため**警告が出る**（サイトを分けてから配ること）
   - 環境ごとに Firebase プロジェクトを分ける構成では何も変わらない
6. functions / firestore → storage → framework hosting の順にデプロイ
   - hosting は複数同梱だと next build がハングするため、ターゲットごとに個別デプロイする
   - **配る先は環境名と一致する hosting ターゲットだけ**（`firebase.json` に複数ある場合）。
     ターゲット名が環境名と無関係な構成では絞り込めず全部に配るので、
     `DEPLOY_HOSTING_TARGETS='web admin'` のように明示する
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
   - `403, The caller does not have permission` / `lacks IAM permission ...` は権限不足。
     **どのアカウントの権限かは実行経路で違う** — ローカル実行なら `firebase login` の
     ユーザー（または ADC）、CI なら `FIREBASE_SERVICE_ACCOUNT` のサービスアカウント。
     CI で出た場合は下の「CI 経由のデプロイ」のロール一覧を見る

## CI 経由のデプロイ

`.github/workflows/deploy.yml` が push トリガーで同じ `scripts/deploy.sh` を実行する:

| ブランチ               | デプロイ先 |
| ---------------------- | ---------- |
| release/** / hotfix/** | staging    |
| production             | production |

develop は CI から自動デプロイしない（複数人の feat/* push が互いに上書きし合うため）。各自 `yarn deploy:develop` で手動デプロイする。

CI には Secrets として `FIREBASE_SERVICE_ACCOUNT`（サービスアカウント JSON）と `ENV_FILE_STAGING` / `ENV_FILE_PRODUCTION`（.env の内容）が必要。

⚠️ **鍵を作る前に、そのサービスアカウントへ IAM ロールを付与する。** Firebase Console が
自動生成する `firebase-adminsdk-*` は既定では Admin SDK 分の権限しか持たず、そのまま CI に
入れるとデプロイが 403 で止まる（しかも足りないロールが段階的に出るため往復になる）。
付与するロールの一覧と `gcloud` のコマンドは `.claude/docs/git-workflow.md`
「CI 用 GitHub Secrets の登録」の「先にサービスアカウントへ IAM ロールを付与する」にある。

### Actions 分の節約

ワークフローは 1 ジョブ構成で、チェックとデプロイを同じジョブで実行する（`setup-node` と `yarn install` の二重実行と、ジョブ単位の最低課金 1 分を避けるため）。
チェックはワークフロー側の step で実行し、`deploy.sh` には `SKIP_CHECKS=1` を渡して二重実行を防いでいる。

デプロイ対象は push の変更差分から判定し、必要なターゲットだけを `--only` で渡す。
`apps/web/` だけの変更なら hosting だけ、`firestore.rules` だけなら firestore だけがデプロイされる。
影響範囲を特定できないファイル（ルート設定・`packages/` 等）が含まれる場合は全ターゲットをデプロイする。
ただし CI も `deploy.sh` と同じ絞り込み（上の 5.）を通すため、**1 プロジェクトに環境を相乗りさせる
構成では、配る側でない環境（通常は staging）から `functions` / `firestore` / `storage` は配られない。**

**デプロイが失敗した回の変更は、次の push では再送されない。** 取りこぼしたときは
`workflow_dispatch`（Actions タブから手動実行）で全ターゲットをデプロイして回復する。
相乗り構成では、この経路でも絞り込みが効く（staging から関数やルールは配られない）。
その3つを配る必要があるなら `production` へのデプロイか、手元からの
`bash scripts/deploy.sh <環境名> --only functions,firestore,storage` で配る。

## ルール

- デプロイ前チェック（型・lint・テスト・ビルド）は deploy.sh が自動実行する。ローカルでスキップしない（`SKIP_CHECKS=1` は CI 専用。CI ではワークフロー側の step が同じチェックを実行済み）
- Firestore / Storage Rules の変更は本番データに即座に影響するため、production へのデプロイ前に差分を必ず確認する
- ルールを変更したら `yarn test:rules` を実行する（Firestore / Storage の両方を検証する）
- 本番環境の `.env.production` の値が最新か確認する

## 派生プロジェクトへの一度きりの移行

ルールテストの実体は `scripts/test-rules.sh` にあり、CI（`ci.yml` / `deploy.yml`）はこれを直接呼ぶ。
`scripts/` も `.github/workflows/` も Template Sync の対象なので、**CI 側は同期だけで正しく動く。**

一方 **ルート `package.json` は Template Sync の対象外**（`.templatesyncignore`）なので、
テンプレート更新を取り込んだ派生プロジェクトでは `yarn test:rules` が古いコマンドのまま残る。
ローカル実行を CI と揃えるため、一度だけ手で書き換える。

```json
"test:rules": "bash scripts/test-rules.sh",
"format": "bash scripts/format.sh",
"format:check": "bash scripts/format.sh --check"
```

書き換えなくても CI は正しく動く（`ci.yml` / `deploy.yml` がスクリプトを直接呼ぶため）が、
手元では `yarn test:rules` が Firestore しか検証せず、`yarn format` は
`packages/` のビルド前に走って Tailwind のクラスを誤った順序に並べ替える（#110）。

なお pre-commit フック（`.husky/pre-commit`）は同期対象なので、
書き換えなくてもコミット時の書き換え事故は起きない。

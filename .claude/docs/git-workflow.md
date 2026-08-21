# Git リリースフロー・マルチ環境

## リリースフロー

```bash
# 1. 機能開発
git fetch origin --prune            # 進行中の release/* を見落とさないため必須
git checkout production && git pull
git checkout -b feat/user-profile
git merge origin/release/1.0.0      # 進行中の release があり、それに載せる場合
# ... 開発・push → develop で動作確認 ...

# 2. リリース準備（出したい機能だけ選ぶ）
git checkout production
git checkout -b release/1.0.0
git merge feat/user-profile
git merge feat/posts
git push origin release/1.0.0  # → staging で QA（push = staging へ自動デプロイ）

# 2.5. QA で見つかった不具合の修正（release に直接コミットしない）
git checkout -b fix/login-error release/1.0.0
# ... 修正・push → develop で動作確認 ...
gh pr create --base release/1.0.0

# 3. リリース
gh pr create --base production
# QA OK → merge → production に自動デプロイ
git tag v1.0.0

# 4. バックマージ（release の修正を取り込む）
git checkout production && git pull
# 次の feat/* は最新の production から切る

# 5. 緊急修正
git checkout -b hotfix/1.0.1 production
# ... 修正 → staging で確認 → production に merge ...
```

## 作業ブランチの切り方

**`production` から切り、進行中の `release/*` があればそれをマージしてから作業する。**

```bash
git fetch origin --prune            # まず必ず実行する
git branch -r --list 'origin/release/*'   # 進行中のリリースを確認
git checkout production && git pull
git checkout -b feat/user-profile
git merge origin/release/1.0.0      # そのリリースに載せる場合のみ
```

### なぜ production から切るのか

**作業内容を必ずしも進行中のリリースに混ぜるとは限らないため。**
分岐元を `release/*` にするとそのリリース行きに固定され、「次のリリースに回す」
「単独で hotfix にする」といった選択ができなくなる。分岐元を `production` に
保っておけば、リリースへの取り込みは後から選べる。

### なぜ release をマージするのか

**`production` は前回リリース時点で止まっており、進行中の `release/*` より
数週間〜数ヶ月遅れていることが普通だから。**
`production` から切ったまま作業すると、
既にマージ済みの変更が存在しない古い土台の上で作業することになり、
リリースへ PR を出した段階で大量のコンフリクトになる。

進行中の release に**混ぜたくない**作業（次のリリース以降に回すもの）は、
マージせず `production` 起点のまま進める。この場合、対象リリースが決まった
時点でそのブランチをマージする。

> ⚠️ **作業開始前に必ず `git fetch origin --prune` を実行すること。**
> `git branch -a` はローカルが持っている参照しか表示しない。fetch していないと
> 進行中の `release/*` が見えず、「production しか無い」と誤認して
> 何ヶ月も古い土台の上で作業を始めてしまう。
> **`production` が最新とは限らない。**

## マルチ環境（develop / staging / production）

Firebase プロジェクトを3つ作成し、環境ごとに使い分ける。
**環境とブランチは 1対1 ではない。**ブランチの種類に応じてデプロイ先が決まる。

### 環境

| 環境         | Firebase プロジェクト     | 用途                   |
| ------------ | ------------------------- | ---------------------- |
| `develop`    | `your-project-develop`    | 開発中の動作確認       |
| `staging`    | `your-project-staging`    | リリース前 QA          |
| `production` | `your-project-production` | 本番                   |

### ブランチ運用

| ブランチ      | デプロイ先   | 切る元         | 用途                     |
| ------------- | ------------ | -------------- | ------------------------ |
| `feat/*`      | develop（手動）| `production`   | 機能開発                 |
| `release/*`   | staging      | `production`   | リリース候補の QA        |
| `hotfix/*`    | staging      | `production`   | 緊急修正                 |
| `production`  | production   | -              | 本番（デフォルトブランチ）|

**上表のブランチ（`feat/*` / `release/*` / `hotfix/*`）は `production` から切る**（`develop` / `staging` はブランチではなく環境名）。
切った直後に、進行中の `release/*` があればマージして作業を始める（→「作業ブランチの切り方」）。
例外は QA で見つかった不具合の修正で、対象の `release/*` から `fix/*` を切る（→「リリースフロー」2.5）。

> ⚠️ **`release/*` / `hotfix/*` への push は staging への自動デプロイを発火する**（`.github/workflows/deploy.yml`）。
> そのため `release/*` への直接コミット・push は禁止。release に直接コミットすると、develop での動作確認を経ずに staging へ直行してしまう。
> QA で見つかった修正も `fix/*` / `feat/*` を切って develop で確認し、`release/*` へ PR でマージする。
> `release/*` へ push してよいのは、ブランチ作成時（`production` から切って `feat/*` をマージした結果）と PR マージのみ。

### 開発〜リリースの流れ

```
production（常にクリーン）
 │
 ├── feat/auth ──→ push → yarn deploy:develop で動作確認
 ├── feat/posts ──→ push → yarn deploy:develop で動作確認
 │
 ├── release/1.0.0 ←── feat/auth + feat/posts を merge
 │       │
 │       └──→ push → staging に自動デプロイ → QA テスト
 │       └──→ QA OK → production に PR → merge → 本番デプロイ + tag
 │
 └── hotfix/1.0.1 ──→ staging で確認 → production に merge
```

### 環境の切り替え（ローカル開発）

```bash
yarn env:develop      # .env.develop → .env.local にコピー + firebase use develop
yarn env:staging      # .env.staging → .env.local にコピー + firebase use staging
yarn env:production   # .env.production → .env.local にコピー + firebase use production
```

### 手動デプロイ

```bash
yarn deploy:develop
yarn deploy:staging
yarn deploy:production
```

CI/CD: `.github/workflows/deploy.yml` が `release/*` / `hotfix/*`（→ staging）と `production` の push で自動デプロイ。
develop は自動デプロイ対象外（複数人の feat/* push が互いに上書きし合うため）。各自 `yarn deploy:develop` で手動デプロイする。

### CI 用 GitHub Secrets の登録

`deploy.yml` はデプロイ時に環境別の env をシークレットから `.env.<環境名>` に書き出す（`secrets[format('ENV_FILE_{0}', name)]`）。
シークレット未登録のまま push すると env が空のままビルドされ失敗するため、事前に登録する。

| Secret 名 | 中身 | 参照されるブランチ |
| --- | --- | --- |
| `ENV_FILE_STAGING` | `.env.staging` の全文 | `release/*` / `hotfix/*`（staging 環境）|
| `ENV_FILE_PRODUCTION` | `.env.production` の全文 | `production`（本番）|
| `FIREBASE_SERVICE_ACCOUNT` | サービスアカウント鍵 JSON の全文 | 全環境共通 |

develop 用のシークレットは不要（CI からデプロイしないため）。

```bash
# 環境別 env の全文をそのまま登録（ローカルにファイルがある前提）
gh secret set ENV_FILE_STAGING < .env.staging
gh secret set ENV_FILE_PRODUCTION < .env.production

# サービスアカウント鍵を登録
# （Firebase Console > プロジェクトの設定 > サービスアカウント > 新しい秘密鍵の生成）
gh secret set FIREBASE_SERVICE_ACCOUNT < service-account.json
```

- `FIREBASE_SERVICE_ACCOUNT` が未設定なら `deploy` ジョブはスキップされ、チェック（型・lint・テスト・ビルド）のみ実行される。
- `firebase login:ci` の `FIREBASE_TOKEN` は firebase-tools v13 以降非推奨のため使わない。
- env ファイルを更新したら、対応する `ENV_FILE_*` シークレットも登録し直す。

### GCP API の初回有効化

新規 Firebase プロジェクトでは以下の GCP API がデフォルトで無効。初回デプロイ前に有効化が必要:

```bash
gcloud services enable cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  eventarc.googleapis.com \
  --project=your-project-id
```

| API | 用途 |
|---|---|
| Cloud Functions API | Cloud Functions のデプロイ |
| Cloud Build API | Functions / Hosting のビルド |
| Artifact Registry API | ビルド成果物の保存 |
| Cloud Run API | Functions (v2) の実行基盤 |
| Eventarc API | Functions (v2) のイベントトリガー |

自動有効化される場合もあるが反映に時間がかかるため、事前に有効化しておくのが確実。
[Google Cloud Console](https://console.cloud.google.com/apis/library) からも有効化可能。

## マージルールの強制（プラン別）

マージルール（production へは release/* と hotfix/* のみ等）の機械的な強制は、GitHub の契約プランによってできることが変わる。

### 全プラン共通（同梱済み）

`.github/workflows/branch-guard.yml` が production 向け PR の head ブランチを検証し、`release/*`・`hotfix/*` 以外なら CI を赤にする。

> **注意**: Free プランのプライベートリポジトリでは Required status checks が使えないため、これは「赤い ✗ による可視化」であり物理的なマージブロックではない。ただし本テンプレートではマージ操作の主体がかなりの割合で AI（Claude）であり、AI は「CI が赤の PR はマージしない」を守るため実効性は高い。

### 対応プラン（Pro / Team / Enterprise、またはパブリックリポジトリ）

Rulesets で強制できる。同梱の定義を取り込む:

```bash
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --input .github/rulesets/production.json
```

内容: production の削除・force push 禁止、PR 必須（レビュー1件）、Required status checks（`ci` / `guard`）。
`hotfix/*` の緊急セルフマージを許す場合は、取り込み後に UI で bypass 設定を調整する。

### Free プランのプライベートリポジトリの場合

マージ操作の強制はできない。branch-guard の可視化と運用規律（CLAUDE.md のマージルール）に依存することを、チームで共有しておく。

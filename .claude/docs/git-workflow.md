# Git リリースフロー・マルチ環境

## リリースフロー

```bash
# 1. 機能開発
git checkout production
git checkout -b feat/user-profile
# ... 開発・push → develop で動作確認 ...

# 2. リリース準備（出したい機能だけ選ぶ）
git checkout production
git checkout -b release/1.0.0
git merge feat/user-profile
git merge feat/posts
git push origin release/1.0.0  # → staging で QA

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
| `feat/*`      | develop      | `production`   | 機能開発                 |
| `release/*`   | staging      | `production`   | リリース候補の QA        |
| `hotfix/*`    | staging      | `production`   | 緊急修正                 |
| `production`  | production   | -              | 本番（デフォルトブランチ）|

**全てのブランチは `production` から切る。** `develop` / `staging` はブランチではなく環境名。

### 開発〜リリースの流れ

```
production（常にクリーン）
 │
 ├── feat/auth ──→ push → develop に自動デプロイ → 動作確認
 ├── feat/posts ──→ push → develop に自動デプロイ → 動作確認
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

CI/CD: `.github/workflows/deploy.yml` でブランチ push 時に自動デプロイ。

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

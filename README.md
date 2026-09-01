# Geckou Project Starter

合同会社Geckou のプロジェクトテンプレート。

**AI に開発させるための制約層**と、その**参照実装スタック**（Turborepo モノレポ）で構成される。
1つのリポジトリから Web・モバイル・Cloud Functions をそれぞれ独立してデプロイできる。

---

## このリポジトリの層

このテンプレートは「実装の詰め合わせ」から「組み立て機」へ移行している最中にある。
共有できる実装は npm パッケージとして外部リポジトリへ切り出し
（[`geckou/kit`](https://github.com/geckou/kit) / [`geckou/ui`](https://github.com/geckou/ui)）、
このリポジトリには**規約を強制する仕組みと、組み立て方**が残る。

| 層 | 中身 | スタック依存 |
| --- | --- | --- |
| **第0層（制約層）** | `.claude/hooks/`、`CLAUDE.md` の規約、`memory/`、プロセス系スキル（`/kickoff` `/next` `/questions` `/wrap-up` `/new-skill`）、commitlint・ESLint 共通ルール・Prettier | **なし** |
| **スタック層** | Next.js + Firebase Hosting + CI/deploy + 環境切替、Firebase（Auth/Firestore/Storage）、Expo、課金 | あり |

**第0層はスタック層に属さない。** スタックが変わっても、規約を機械的に強制する仕組みはそのまま使える。
スタックに依存する値（パッケージマネージャ、監視パス等）はフック本体に直書きせず
[`.claude/hooks/config.sh`](.claude/hooks/config.sh) に集める。

### スタック層の内訳（core + opt-in）

```
core              LP が作れる最小構成（Next.js + Hosting + CI/deploy + 環境切替）
 └ firebase       Auth + Firestore + Storage + rules + emulator + Admin SDK
      └ functions apps/functions（API・トリガー・スケジュール実行の器）
           ├ mobile   Expo（iOS / Android）
           └ billing  Stripe / RevenueCat の配線
```

層の定義は [`layers.json`](layers.json)（層マニフェスト）が持ち、
`node scripts/remove-layer.mjs <層>` で層ごと外せる。

```bash
node scripts/remove-layer.mjs mobile     # Expo を外す
node scripts/remove-layer.mjs firebase   # core 構成にする（配下も連鎖して外れる）
node scripts/add-layer.mjs billing       # 課金を足す（前提の層も一緒に入る）
```

外すとファイル・依存・設定のキー・環境変数・CI ステップがまとめて消え、足すと戻る
（実体はテンプレートから取り寄せ、ローカルの変更は 3-way マージで保たれる）。
実行後は `yarn install` と `yarn format`。外部サービスの設定など判断が要る手順は
`/add-firebase` `/add-functions` `/add-mobile` `/add-billing` の各スキルが案内する。
詳細は [`.claude/docs/layers.md`](.claude/docs/layers.md)。

**リポジトリの既定は今も全部入り**（[#105](https://github.com/geckou/project-starter/issues/105) で進行中）。
6 構成（`core` / `+firebase` / `+functions` / `+functions+billing` / `+functions+mobile` / 全部入り）の
ビルド検証は `.github/workflows/layer-matrix.yml` が行う。

---

## Tech Stack

| カテゴリ     | 技術                                                         | 用途                                     |
| ------------ | ------------------------------------------------------------ | ---------------------------------------- |
| モノレポ管理 | Turborepo                                                    | ワークスペース間のビルド・キャッシュ管理 |
| Web          | Next.js 15 (App Router)                                      | SSR 対応の Web アプリ                    |
| Mobile       | Expo SDK 52 (Expo Router)                                    | iOS / Android アプリ                     |
| 言語         | TypeScript                                                   | 全パッケージ共通                         |
| Backend      | Firebase (Auth / Firestore / Functions / Hosting)            | 認証・DB・API・ホスティング              |
| スタイル     | Tailwind CSS v4 (Web) / NativeWind v4 + Tailwind v3 (Mobile) | ユーティリティ CSS                       |
| 課金         | Stripe（Web） / RevenueCat（Mobile の IAP）                  | サブスクリプション                       |
| コード品質   | ESLint + Prettier                                            | リント・フォーマット                     |
| CI           | GitHub Actions                                               | 型チェック・リント・ビルドの自動実行     |

---

## 全体の構成

```
project-starter/
│
├── apps/                        # デプロイ可能なアプリケーション
│   ├── web/                     # Next.js（Firebase Hosting の webframeworks でデプロイ）
│   │   ├── src/
│   │   │   ├── app/             # App Router のページ
│   │   │   ├── lib/
│   │   │   │   ├── firebase.ts        # クライアント用 Firebase（"use client"）
│   │   │   │   └── firebase-admin.ts  # サーバー用 Firebase Admin（SSR / API Route）
│   │   │   └── styles/
│   │   │       └── globals.css        # Tailwind v4 の読み込み
│   │   ├── tailwind.config.ts   # shared/theme からデザイントークンを読み込み
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   ├── mobile/                  # Expo（App Store / Google Play にデプロイ）
│   │   ├── src/
│   │   │   ├── app/             # Expo Router のページ
│   │   │   └── lib/
│   │   │       └── firebase.ts  # expo-constants 経由で Firebase 設定を取得
│   │   ├── tailwind.config.js   # shared/theme からデザイントークンを読み込み
│   │   ├── metro.config.js      # NativeWind + モノレポ対応
│   │   ├── babel.config.js
│   │   ├── app.config.ts        # Expo 設定（.env.local から Firebase 設定を注入）
│   │   └── package.json
│   │
│   └── functions/               # Firebase Cloud Functions（Firebase にデプロイ）
│       ├── src/
│       │   └── index.ts         # Functions エントリーポイント
│       ├── tsconfig.json
│       └── package.json
│
├── packages/                    # アプリ間で共有するライブラリ
│   └── shared/
│       └── src/
│           ├── types/           # 共通の型定義（User, Subscription, ApiResponse 等）
│           ├── billing/         # @geckou/billing/entitlement の re-export
│           ├── utils/           # ユーティリティ関数（formatDate 等）
│           ├── firebase/        # Firebase クライアント SDK の初期化
│           ├── firestore/       # Firestore の CRUD・クエリ・購読
│           ├── storage/         # Firebase Storage のアップロード・削除
│           ├── stores/          # Zustand ストア（認証状態等）
│           ├── i18n/            # 翻訳キーとロケール（ja / en）
│           ├── theme/           # デザイントークン（色・フォント・角丸）
│           └── index.ts         # 一括エクスポート
│
├── .claude/                     # 第0層（制約層）: AI に規約を機械的に強制する
│   ├── hooks/                   # 実行前後に割り込むフック（settings.json で登録）
│   │   ├── config.sh            # スタック依存の値（runner・DoD タスク・監視パス）
│   │   ├── pre-git-guard.sh     # ブランチ名・分岐元・コミットメッセージを実行前に検証
│   │   ├── stop-dod-check.sh    # 終了時に DoD（type-check / lint / test）を自動実行
│   │   └── ...
│   ├── skills/                  # スラッシュコマンド（/next /review /questions 等）
│   ├── docs/                    # プロダクトのドキュメント
│   │   ├── planning.md          # 企画書
│   │   ├── spec.md              # 仕様書（技術仕様の正）
│   │   ├── roadmap.md           # ロードマップ（進捗の正）
│   │   ├── questions.md         # 確認事項キュー（ユーザー確認待ちの判断）
│   │   └── ...                  # architecture / layers / git-workflow / dependencies 等
│   └── settings.json            # フックの登録
│
├── memory/                      # 進化的メモリ（フィードバックの蓄積と昇格）
│   ├── evolution.md             # 昇格プロトコル（pain_count → CLAUDE.md → Hook）
│   └── short-term/  long-term/  daily/
│
├── scripts/                     # セットアップ・デプロイ・検証スクリプト
│   ├── setup.sh  use-env.sh  deploy.sh
│   ├── add-layer.mjs  remove-layer.mjs  check-layers.mjs   # 層の加算・減算・検証
│   └── test-hooks.sh  test-layers.sh  test-rules.sh  check-docs.sh
│
├── .github/
│   ├── workflows/               # CI・デプロイ・タグ昇格・Template Sync 等
│   ├── rulesets/                # ブランチ保護・Copilot 自動レビューの定義（gh api で取り込む）
│   ├── ISSUE_TEMPLATE/
│   └── copilot-instructions.md  # Copilot のレビュー方針
│
├── layers.json                  # 層マニフェスト（どのファイルがどの層か。機械可読）
├── renovate/                    # 依存更新の preset（派生プロジェクトが extends する）
├── firebase.json                # Firebase Functions / Hosting / Emulators 設定
├── .firebaserc                  # Firebase プロジェクト ID
├── turbo.json                   # Turborepo タスク定義
├── .prettierrc                  # Prettier 設定（singleQuote 等）
├── .env.example                 # 環境変数のテンプレート
└── package.json                 # ワークスペースルート + スクリプト定義
```

---

## 前提条件

| ツール       | バージョン | 確認コマンド         |
| ------------ | ---------- | -------------------- |
| Node.js      | 22 以上    | `node -v`            |
| yarn         | 1.x        | `yarn -v`            |
| Firebase CLI | 最新       | `firebase --version` |

Node.js のバージョンは `.nvmrc` で管理している。nvm を使っている場合は `nvm use` で切り替え可能。

---

## Getting Started

### 1. テンプレートからリポジトリを作成

GitHub の「Use this template」ボタンから新しいリポジトリを作成。

### 2. セットアップ（対話式）

```bash
yarn setup
```

これで以下が自動的に行われる:

- `.env.local` の作成（`.env.example` からコピー）
- `.firebaserc` の Firebase Project ID 設定
- Node.js / yarn のバージョンチェック
- `yarn install`（依存関係のインストール）

### 3. GCP API の有効化（初回のみ）

新規 Firebase プロジェクトでは以下の GCP API がデフォルトで無効になっている。
初回デプロイ前に [Google Cloud Console](https://console.cloud.google.com/apis/library) で有効化する:

```bash
# gcloud CLI で一括有効化する場合
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

> Cloud Build / Artifact Registry / Cloud Run / Eventarc は Functions デプロイ時に自動有効化される場合もあるが、反映に時間がかかるため事前に有効化しておくのが確実。

### 4. 環境変数の設定

`.env.local` を開き、Firebase の設定値を入力する。

```bash
# 値の取得先: Firebase Console > Project Settings > General > Web app
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

サーバーサイド（SSR）で Firebase Admin を使う場合は `FIREBASE_SERVICE_ACCOUNT_KEY` も設定する。
ローカル開発では `GOOGLE_APPLICATION_CREDENTIALS` でファイルパスを指定する方が簡単:

```bash
# ローカル開発用（.env.local に追加）
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

#### 環境別 env ファイルの作成（develop / staging / production）

`yarn env:<環境名>` / `yarn deploy:<環境名>` は環境別の env ファイルを前提にする。
ファイルが無いと [`scripts/use-env.sh`](scripts/use-env.sh) が `exit 1` で止まり、型チェック・デプロイに到達しない。

`.env.example` を各環境用にコピーして作成する（冒頭コメントに手順あり）:

```bash
cp .env.example .env.develop
cp .env.example .env.staging
cp .env.example .env.production
```

環境ごとに書き換える主な値:

| 変数 | 環境差分 |
| --- | --- |
| `BASIC_AUTH_CREDENTIALS` | develop / staging のみ設定。production は未設定 |
| `NEXT_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_API_BASE_URL` | 環境ごとの API エンドポイント |
| `NEXT_PUBLIC_GTM_ID` | 本番のみ設定する等 |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN` | 環境ごとの DSN |
| Firebase 設定値（`NEXT_PUBLIC_FIREBASE_*` 等） | Firebase プロジェクトを分けている場合 |

作成後、使う環境に切り替える:

```bash
yarn env:develop      # .env.develop → .env.local にコピー + firebase use develop
yarn env:staging
yarn env:production
```

#### CI 自動デプロイ用の GitHub Secrets 登録

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) はデプロイ時に環境別の env をシークレットから `.env.local` に書き出す。
未登録のまま push すると `.env.local` が空のままビルドされ失敗する。
リポジトリに以下を登録する（値は対応する env ファイルの全文）:

| Secret 名 | 中身 | 登録コマンド |
| --- | --- | --- |
| `ENV_FILE_STAGING` | `.env.staging` の全文 | `gh secret set ENV_FILE_STAGING < .env.staging` |
| `ENV_FILE_PRODUCTION` | `.env.production` の全文 | `gh secret set ENV_FILE_PRODUCTION < .env.production` |
| `FIREBASE_SERVICE_ACCOUNT` | サービスアカウント鍵 JSON の全文 | `gh secret set FIREBASE_SERVICE_ACCOUNT < service-account.json` |

- CI 自動デプロイの対象は `release/*` / `hotfix/*`（staging）と `production` のみ。develop へは各自 `yarn deploy:develop` で手動デプロイする（複数人の push が互いに上書きし合うのを防ぐため）。
- `FIREBASE_SERVICE_ACCOUNT` 未設定の場合、`deploy` ジョブはスキップされチェックのみ実行される。

詳細は [.claude/docs/git-workflow.md](.claude/docs/git-workflow.md) を参照。

### 5. 開発

```bash
# Web のみ起動（最もよく使う）
yarn dev:web

# 全アプリ起動
yarn dev

# Mobile のみ
yarn dev:mobile

# Firebase エミュレーター起動（Functions / Firestore / Auth をローカルで動かす）
yarn firebase:emulators
```

---

## Claude との協働ガイド

このテンプレートは AI（Claude Code）が `.claude/docs/` のドキュメントを読んで自律的に開発を進める前提で設計されている。
指示の仕方でフローへの乗り方が変わるので、場面別の言い回しを参考にする。

### 止まらずに進む仕組み

確認のたびに作業が止まると、人の空き時間が「AI が待っている状態」で埋まる。
そうならないよう、判断が要る場面での動きを規約で決めてある（[CLAUDE.md](CLAUDE.md)「自律性の境界」）。

| 出てきたもの | AI の動き | 人がやること |
|---|---|---|
| 仕様書にある実装・バグ修正 | そのまま進める | なし |
| **判断が要ること** | `.claude/docs/questions.md` に積み、その作業を保留して別の作業へ移る | 空き時間に `/questions` でまとめて答える |
| **今の PR に混ぜたくない問題** | Issue に切って、あとで自分で対応する | 見えていればよい |
| 取り消せない操作（デプロイ・本番データ・force push） | その場で止めて聞く | 判断する |

作業が一区切りしたら、**確認を待たずに push して PR を出す**。人がやるのはマージの判断だけ。
PR は DoD（type-check / lint / test）とセルフレビュー（`/review`）を通してから出るので、
自動レビューの指摘も含めて片付いた状態で届く。

**進められる作業が尽きたら、そこで聞く。** キューは待ち行列であって逃げ場ではない。

### 場面別プロンプト例

| 場面 | 言い方の例 |
|---|---|
| プロジェクト開始（ゼロから） | 「`/kickoff` して。企画を一緒に詰めたい」 |
| 既存リポジトリの移植 | 「`/migrate` で `~/projects/old-app` を移植して」 |
| 次のタスクを決める | 「`/next`」または「次何をすればいい？」 |
| 機能を追加したい | 「XX 機能を追加したい。まず spec.md に追記してから実装して」 |
| 仕様を変えたい | 「XX の仕様を YY に変えたい。仕様書から直して」 |
| バグを直したい | 「XX すると ZZ になる。`/troubleshoot` して」 |
| コードレビュー | 「`/review` でこのブランチを見て」 |
| 溜まった確認事項に答える | 「`/questions`」（空き時間にまとめて答える） |
| 切り出した Issue を消化する | 「`/next`」（未着手機能と open な Issue から選ぶ） |
| セッションを終える | 「今日はここまで。`/wrap-up` して」 |

### 避けたほうがいい指示

- **仕様書を飛ばした実装依頼**（「とりあえずこの機能作って」）→ 仕様書と実装が乖離し、以後の AI の判断基準が壊れる。「spec.md に追記してから」を付ける
- **引き継ぎなしのセッション終了** → 次のセッションが状況を把握できない。終了時は `/wrap-up` を実行する
- **進捗の口頭管理**（「あれ終わった？」だけで済ませる）→ 進捗の正は `roadmap.md` の機能ステータス表。表の更新まで指示する

### GitHub 連携（任意）

| 機能 | セットアップ |
|---|---|
| PR 自動レビュー / `@claude` メンション | リポジトリの Secrets に `ANTHROPIC_API_KEY` を登録（未登録ならスキップされる）。`.github/workflows/claude.yml` |
| Copilot の自動レビュー | `.github/rulesets/copilot-review.json` を `gh api` で 1 回取り込む。以後は PR を開くだけでレビューが走る（[`.claude/docs/git-workflow.md`](.claude/docs/git-workflow.md)） |
| テンプレート更新の取り込み | 追加のシークレット登録は不要（親テンプレートは public）。取り込み対象外は `.templatesyncignore` で管理。`.github/workflows/template-sync.yml` |
| CI をテンプレート参照にする | 派生側は `uses: geckou/project-starter/.github/workflows/ci.yml@v1` の 1 行だけ持つ。チェック内容の修正が取り込み作業ゼロで届く（[`.claude/docs/git-workflow.md`](.claude/docs/git-workflow.md)） |
| 依存更新（Renovate） | `renovate.json5` がテンプレートの preset を参照する。Renovate の GitHub App のインストールが前提（[`.claude/docs/dependencies.md`](.claude/docs/dependencies.md)） |

---

## Scripts

| コマンド                         | 説明                        |
| -------------------------------- | --------------------------- |
| `yarn setup`                     | 初回セットアップ（対話式）  |
| `yarn dev`                       | 全アプリの開発サーバー起動  |
| `yarn dev:web`                   | Web のみ起動                |
| `yarn dev:mobile`                | Mobile のみ起動             |
| `yarn dev:functions`             | Functions の watch ビルド   |
| `yarn build`                     | 全アプリのビルド            |
| `yarn build:functions`           | Functions のみビルド        |
| `yarn test`                      | 全テスト実行                |
| `yarn test:rules`                | Firestore / Storage ルールのテスト（エミュレーター経由） |
| `yarn test:hooks`                | `.claude/hooks/` の回帰テスト（node_modules 不要） |
| `yarn check:docs`                | ドキュメントの参照切れ検出（node_modules 不要） |
| `yarn lint`                      | 全アプリの ESLint 実行      |
| `yarn lint:fix`                  | ESLint の自動修正           |
| `yarn format`                    | Prettier でフォーマット     |
| `yarn format:check`              | フォーマットのチェックのみ  |
| `yarn type-check`                | 全パッケージの型チェック    |
| `yarn firebase:emulators`        | Firebase エミュレーター起動 |
| `yarn env:<環境名>`              | 環境切り替え（develop / staging / production） |
| `yarn deploy:<環境名>`           | 事前チェック付きデプロイ（develop / staging / production） |
| `yarn firebase:deploy`           | Firebase 全体をデプロイ（チェックなしの素のコマンド） |
| `yarn firebase:deploy:functions` | Functions のみデプロイ      |
| `yarn firebase:deploy:hosting`   | Hosting のみデプロイ        |

> デプロイは `yarn deploy:<環境名>` を推奨。型チェック・テスト・ビルドの事前実行、
> webframeworks experiment の有効化、workspace 依存の一時削除（Cloud Build 対策）まで自動で行う。

---

## モノレポの仕組み

### ワークスペース

ルートの `package.json` に以下の定義がある:

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

これにより `apps/` と `packages/` 配下のディレクトリは全て独立したパッケージとして認識される。
パッケージ間の依存は `package.json` に `"@geckou/shared": "*"` のように書くだけで繋がる。

### 共有コードの使い方

`packages/shared` のコードはどのアプリからでもインポートできる:

```typescript
import { formatDate } from '@geckou/shared'
import type { User } from '@geckou/shared'
```

Firebase クライアント SDK を含めたくない場合（Functions 等）は個別にインポート:

```typescript
import type { User } from '@geckou/shared/types'
import { formatDate } from '@geckou/shared/utils'
```

### アプリやパッケージの追加

`apps/` 配下にディレクトリを作り、`package.json` に `"name": "@geckou/<name>"` と書いて `yarn install` するだけ。
Turborepo が自動的に認識するので、設定ファイルの追加は不要。

詳しくは [apps/README.md](apps/README.md) と [packages/README.md](packages/README.md) を参照。

---

## Firebase の構成

### クライアント / サーバーの使い分け（Web）

Next.js はサーバーサイド（SSR / API Route / Server Actions）とクライアントサイドが混在する。
Firebase SDK はそれぞれ別のモジュールを使う。

| 実行環境     | ファイル                             | SDK                           | 用途                                 |
| ------------ | ------------------------------------ | ----------------------------- | ------------------------------------ |
| クライアント | `apps/web/src/lib/firebase.ts`       | `firebase` (クライアント SDK) | ログイン UI、リアルタイム更新        |
| サーバー     | `apps/web/src/lib/firebase-admin.ts` | `firebase-admin` (Admin SDK)  | SSR でのデータ取得、認証トークン検証 |

`firebase-admin.ts` は `server-only` パッケージで保護されており、
クライアントコンポーネントから誤って import するとビルドエラーになる。

### 環境変数

| 変数                           | 用途                       | 公開範囲                         |
| ------------------------------ | -------------------------- | -------------------------------- |
| `NEXT_PUBLIC_FIREBASE_*`       | Web クライアント用         | ブラウザに露出する（公開前提）   |
| `FIREBASE_*`                   | Mobile (Expo) 用           | `app.config.ts` の `extra` 経由で参照 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Web サーバー用 (Admin SDK) | サーバーのみ。絶対に公開しない   |

---

## 課金 / サブスクリプション

> **セットアップから実装までの手順は `.claude/docs/billing.md`** にまとめてある。
> 実際に決済を組むときはそちらを順に進める。ここは概要のみ。

**モバイルはアプリ内課金（IAP）、Web は Stripe** の2経路。
どちらで購入されても、権利状態は Firestore の `users/{uid}.subscription` に集約される。

| 経路 | 決済 | 手数料 | 使いどころ |
| --- | --- | --- | --- |
| Mobile アプリ内 | IAP（RevenueCat 経由） | Apple 26% / Google 30%（中小 15%） | アプリでその場で買わせたい |
| Web（ブラウザ） | Stripe | 3.6% 前後 | LP・Web から契約させる |

**片方だけでも使える。** 環境変数が未設定の経路は無効になる。
Web でしか売らないなら `STRIPE_*` だけ、アプリ内課金だけなら `REVENUECAT_*` だけ設定すればよい。

> アプリ内から Web 決済へのリンクアウトは採用していない。スマホ新法（2025年12月施行）で
> 日本でも解禁されたが、Apple 15% / Google 20% のストア手数料に加えて、
> Apple / Google への月次の取引報告を恒久的に運用する義務が発生するため。
> 詳細は `.claude/docs/architecture.md` の「課金」を参照。

### 構成

決済ロジックの本体は [`@geckou/billing`](https://github.com/geckou/kit)（npm パッケージ）にあり、
このリポジトリに残るのは配線と、プロジェクトごとに編集する権利変化フックだけ。
ファイル単位の一覧は [.claude/docs/architecture.md](.claude/docs/architecture.md) の
「課金 > ファイル構成」を参照。

### 権利判定

```typescript
import { isSubscriptionActive } from '@geckou/shared'

if (isSubscriptionActive(user.subscription)) {
  // 有料機能を出す
}
```

`status` は `active` / `in_grace_period` / `cancelled` / `expired` の4種類。
`cancelled` は自動更新が止まっただけで `currentPeriodEnd` までは利用できる（ヘルパーが吸収する）。

### セットアップ

環境変数の一覧、Stripe / RevenueCat 側の設定手順、テストモードの分け方は
[.claude/docs/billing.md](.claude/docs/billing.md) に順を追ってまとめてある。
権利状態の保護（`firestore.rules` での書き込み拒否、`billing_events` による冪等化）の方針は
[.claude/docs/architecture.md](.claude/docs/architecture.md) の「課金 > セキュリティ上の要点」。

---

## Tailwind CSS / デザイントークン

デザイントークンは `packages/shared/src/theme/index.ts` に集約し、Web（Tailwind v4）と
Mobile（NativeWind + Tailwind v3）の両方の設定から読み込んでいる。色を変えるときはこの1ファイルだけ触る。

- 設定ファイルの流れと各ファイルの役割 → [packages/README.md](packages/README.md)
- バージョンが違う理由と方針 → [.claude/docs/architecture.md](.claude/docs/architecture.md)

---

## Google Tag Manager

GTM は環境変数で管理。`.env.local` に ID を設定するだけで有効になる。

```
NEXT_PUBLIC_GTM_ID=GTM-XXXXXX
```

- 値が空の場合はスクリプトが出力されない（開発環境で邪魔にならない）
- コンポーネント: `apps/web/src/components/GoogleTagManager.tsx`
- `layout.tsx` で `<head>` にスクリプト、`<body>` に noscript を配置済み
- GA4、広告タグ、Clarity 等は全て GTM 経由で管理する想定

---

## Web のみで使う場合

Mobile が不要なら `apps/mobile/` を削除するだけ。他の設定変更は不要。

```bash
rm -rf apps/mobile
yarn install
yarn dev:web
```

---

## 命名規則

ファイル名・変数・型名・CSS クラス名のケースは
[CLAUDE.md](CLAUDE.md) の「コーディング規約 > 命名規則」を参照。
ESLint / Prettier で強制できる範囲は各ワークスペースの設定に入っている。

---

## Git ブランチ運用

**デフォルトブランチは `production`**（`main` ではない）。全てのブランチは `production` から切る。

- ブランチ命名規則・コミットメッセージ規約・マージルール →
  [CLAUDE.md](CLAUDE.md) の「Git ブランチ運用」。
  `.claude/hooks/pre-git-guard.sh` が実行前に検証し、違反はブロックされる
- リリースフロー・マルチ環境構成・GitHub Secrets の登録 →
  [.claude/docs/git-workflow.md](.claude/docs/git-workflow.md)

---

## Basic 認証（develop / staging のみ）

`apps/web/src/middleware.ts` で Basic 認証を実装している。
`BASIC_AUTH_CREDENTIALS` が設定されている環境でのみ有効になる。

```bash
# .env.develop / .env.staging
BASIC_AUTH_CREDENTIALS=admin:secret

# .env.production は未設定のまま → 自動的に無効
```

production では env を設定しなければ middleware が即座に通過するので、
分岐ロジックを書く必要はない。

---

## トラブルシューティング

### Firebase Emulator が起動しない（Java がない）

Firestore Emulator は Java Runtime が必要。macOS にはデフォルトで入っていない。

```bash
brew install openjdk
echo 'export PATH="/usr/local/opt/openjdk/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
java -version  # 確認
```

### GCP 請求先アカウントのプロジェクト数制限

Blaze プランに上げようとして「割り当て上限に達しました」と出る場合:

1. 不要なプロジェクトの請求先リンクを外す（最速）
2. [割り当て引き上げ申請](https://console.cloud.google.com/billing)をする（数日かかる）
3. 新しい請求先アカウントを作る

デフォルトは請求先 1 つにつき 5 プロジェクトまで。

### iOS バンドル ID は後から変更不可

Firebase Console で iOS アプリ登録時の**バンドル ID は変更できない**。
最初から `com.geckou.<プロジェクト名>` 形式で登録すること。
間違えた場合は iOS アプリを削除→再登録が必要。

---

## プロジェクトに合わせたカスタマイズ

### ディレクトリ名・パッケージ名の変更

`web/` や `mobile/` はテンプレートの仮名で、実プロジェクトに合わせて変更してよい。
改名の手順と例は [apps/README.md](apps/README.md) を参照。

### リネームチェックリスト

テンプレートには `geckou` 名がハードコードされている箇所がある。
`/init-project` がまとめて置換するので通常は手作業不要だが、確認用に主な箇所を挙げる
（除外すべきパッケージなど網羅的な一覧はスキル側にある）:

| 箇所 | ファイル |
|---|---|
| パッケージスコープ `@geckou/*` | 各 `package.json` の `name`・`dependencies`、ルートの `nohoist`、`scripts/deploy.sh` |
| アプリ名 `Geckou App` / 社名 | `apps/mobile/app.config.ts`、`apps/web/src/app/layout.tsx` |
| Bundle ID `com.geckou.app` | `apps/mobile/app.config.ts`（iOS / Android。**iOS は Firebase 登録後に変更不可**） |
| URL スキーム `geckou` | `apps/mobile/app.config.ts` の `scheme` |
| Expo slug `geckou-app` | `apps/mobile/app.config.ts` |

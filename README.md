# Geckou Project Starter

合同会社Geckou のプロジェクトテンプレート。

Turborepo によるモノレポ構成で、1つのリポジトリから Web・モバイル・Cloud Functions をそれぞれ独立してデプロイできる。

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
| コード品質   | ESLint + Prettier                                            | リント・フォーマット                     |
| CI           | GitHub Actions                                               | 型チェック・リント・ビルドの自動実行     |

---

## 全体の構成

```
project-starter/
│
├── apps/                        # デプロイ可能なアプリケーション
│   ├── web/                     # Next.js（Vercel / Cloud Run 等にデプロイ）
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
│   │   ├── app.json
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
│           ├── types/           # 共通の型定義（User, ApiResponse 等）
│           ├── utils/           # ユーティリティ関数（formatDate 等）
│           ├── firebase/        # Firebase クライアント SDK の初期化
│           ├── theme/           # デザイントークン（色・フォント・角丸）
│           └── index.ts         # 一括エクスポート
│
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
| Node.js      | 20 以上    | `node -v`            |
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

### 3. 環境変数の設定

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

### 4. 開発

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
| `yarn lint`                      | 全アプリの ESLint 実行      |
| `yarn format`                    | Prettier でフォーマット     |
| `yarn format:check`              | フォーマットのチェックのみ  |
| `yarn type-check`                | 全パッケージの型チェック    |
| `yarn firebase:emulators`        | Firebase エミュレーター起動 |
| `yarn firebase:deploy`           | Firebase 全体をデプロイ     |
| `yarn firebase:deploy:functions` | Functions のみデプロイ      |
| `yarn firebase:deploy:hosting`   | Hosting のみデプロイ        |

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
| `FIREBASE_*`                   | Mobile (Expo) 用           | `app.json` の `extra` 経由で参照 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Web サーバー用 (Admin SDK) | サーバーのみ。絶対に公開しない   |

---

## RevenueCat（課金 / サブスクリプション）

Web・Mobile の両方で RevenueCat を使った課金に対応している。

### 構成

| プラットフォーム | ファイル                                   | SDK                        | 用途                                                |
| ---------------- | ------------------------------------------ | -------------------------- | --------------------------------------------------- |
| Mobile           | `apps/mobile/src/lib/revenuecat.ts`        | `react-native-purchases`   | アプリ内課金（iOS / Android）                       |
| Web              | `apps/web/src/lib/revenuecat.ts`           | `@revenuecat/purchases-js` | Web 課金（`"use client"`）                          |
| Functions        | `apps/functions/src/revenuecat-webhook.ts` | なし（Express で受信）     | Webhook で Firestore のサブスクリプション状態を同期 |

### 環境変数

| 変数                             | 用途             | 設定場所                               |
| -------------------------------- | ---------------- | -------------------------------------- |
| `NEXT_PUBLIC_REVENUECAT_API_KEY` | Web SDK 用       | `.env.local`                           |
| `REVENUECAT_API_KEY_APPLE`       | iOS 用           | `.env.local`（app.json の extra 経由） |
| `REVENUECAT_API_KEY_GOOGLE`      | Android 用       | `.env.local`（app.json の extra 経由） |
| `REVENUECAT_WEBHOOK_SECRET`      | Webhook 署名検証 | `apps/functions/.env`                  |

全て RevenueCat Dashboard > API Keys から取得。

### Webhook の設定

1. Firebase Functions をデプロイする
2. RevenueCat Dashboard > Integrations > Webhooks を開く
3. Webhook URL に以下を設定:
   ```
   https://<region>-<project-id>.cloudfunctions.net/api/webhooks/revenuecat
   ```
4. Signing Secret を `apps/functions/.env` の `REVENUECAT_WEBHOOK_SECRET` に設定

Webhook で `INITIAL_PURCHASE` / `RENEWAL` / `CANCELLATION` / `EXPIRATION` イベントを受信し、
Firestore の `users/{userId}.subscription` を自動更新する。

---

## Tailwind CSS / デザイントークン

### Web と Mobile でバージョンが違う理由

- **Web**: Tailwind CSS **v4**（最新。CSS ベースの設定方式）
- **Mobile**: Tailwind CSS **v3** + NativeWind（NativeWind が v3 を必要とするため）

書き方（`className="text-primary-500"` 等）はどちらも同じ。

### デザイントークンの共有

色・フォント・角丸等のデザイントークンは `packages/shared/src/theme/index.ts` で一元管理している。

```
packages/shared/src/theme/index.ts    ← 単一の情報源
        │
        ├── apps/web/tailwind.config.ts       ← import で読み込み
        └── apps/mobile/tailwind.config.js    ← require で読み込み
```

色やフォントを変えたいときは `theme/index.ts` を編集するだけで両方に反映される。

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

| 対象                         | ケース             | 例                        |
| ---------------------------- | ------------------ | ------------------------- |
| ファイル名（通常）           | ケバブケース       | `user-profile.ts`         |
| ファイル名（コンポーネント） | パスカルケース     | `UserProfile.tsx`         |
| 変数・関数                   | キャメルケース     | `userName`, `fetchData`   |
| 定数                         | コンスタントケース | `MAX_RETRY_COUNT`         |
| 型名                         | パスカルケース     | `ChatRoom`, `ApiResponse` |
| CSS クラス名                 | スネークケース     | `user_icon`               |

略語は避け、誰が見ても意味が明確な命名にする:

```
// Good
button, message, notification

// Bad
btn, msg, noti
```

---

## Git ブランチ運用

### デフォルトブランチ

`production`（`main` ではない）。全てのブランチは `production` から切る。

### ブランチ命名規則

| 種類       | パターン               | 例                      | 切る元       | デプロイ先 |
| ---------- | ---------------------- | ----------------------- | ------------ | ---------- |
| 機能開発   | `feat/<名前>`          | `feat/user-profile`     | `production` | develop    |
| リリース   | `release/<バージョン>` | `release/1.0.0`         | `production` | staging    |
| 緊急修正   | `hotfix/<バージョン>`  | `hotfix/1.0.1`          | `production` | staging    |
| リファクタ | `refactor/<名前>`      | `refactor/api-client`   | `production` | develop    |
| バグ修正   | `fix/<名前>`           | `fix/login-error`       | `production` | develop    |
| ドキュメント | `docs/<名前>`        | `docs/api-spec`         | `production` | -          |
| テスト     | `test/<名前>`          | `test/webhook`          | `production` | develop    |

### ブランチ名のルール

- **ケバブケースで書く**（`feat/user-profile`、`feat/UserProfile` は NG）
- **短く、何をするか分かる名前にする**（`feat/update` は NG）
- **チケット番号があれば先頭に付ける**（`feat/123-user-profile`）

### コミットメッセージ規約

```
<type>: <description>
```

| type       | 用途                             |
| ---------- | -------------------------------- |
| `feat`     | 新機能                           |
| `fix`      | バグ修正                         |
| `refactor` | リファクタリング（機能変更なし） |
| `style`    | コードスタイル修正（動作変更なし） |
| `docs`     | ドキュメントのみ                 |
| `test`     | テスト追加・修正                 |
| `chore`    | ビルド・設定変更                 |

### マージルール

- `production` への直接 push は禁止（PR 必須）
- `release/*` → `production` は PR + レビュー必須
- `hotfix/*` → `production` は PR 必須（緊急時はセルフマージ可）
- `feat/*` → `release/*` へのマージは自由
- `feat/*` 同士のマージは禁止（依存関係を作らない）

### リリースフロー

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

# 4. 緊急修正
git checkout -b hotfix/1.0.1 production
# ... 修正 → staging で確認 → production に merge ...
```

---

## プロジェクトに合わせたカスタマイズ

### ディレクトリ名・パッケージ名の変更

`web/` や `mobile/` はテンプレートの仮名。実プロジェクトに合わせて変更可。

例: CustomJapan プロジェクトの場合

```
apps/
├── customjapan/        # メインサイト
├── customjapan-admin/  # 社内管理画面
└── functions/
```

変更時は `package.json` の `name` も合わせて更新する:

```json
{
  "name": "@geckou/customjapan"
}
```

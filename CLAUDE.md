# CLAUDE.md

このプロジェクトの Claude Code 向け設定。

## プロジェクト概要

Turborepo モノレポ。Next.js 15 (Web) + Expo 52 (Mobile) + Firebase Cloud Functions。
共有コードは `packages/shared` に集約。

## コーディング規約

### 基本

- インデントはスペース2つ。タブは使わない
- 改行は LF
- 文字コードは UTF-8
- シングルクォートを使う（Prettier で強制）
- 末尾のセミコロンは省略する（Prettier で強制）
- `key-spacing: align: 'colon'` のスタイルに従う

### 空白行

- 複数行にわたるコードブロック（関数、条件分岐、オブジェクト等）の間は空白行を挟んで見やすくする
- 1行で完結するコード（変数宣言、import 等）は連続で書いてよい

```typescript
// Good
const name = 'hello'
const count = 10

if (count > 5) {
  doSomething()
}

const result = await fetchData()

if (result.error) {
  handleError(result.error)
}
```

### 命名規則

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

### JavaScript / TypeScript

- 変数宣言は原則 `const`。やむを得ない場合のみ `let`
- 比較演算子は `===` / `!==` を使う（`==` / `!=` は使わない）
- 配列の変数名は複数形にする（`users`, `messages`）
- `type` を使う（`interface` は使わない）

### HTML / JSX

- セマンティックなマークアップを意識する（`div` の乱用を避ける）
- Tailwind CSS のクラスでスタイリングする

### React / Next.js

- Server Component をデフォルトとし、必要な場合のみ `'use client'` を付ける
- 同じ要素を繰り返し使う場合はコンポーネントに切り分ける
- アイコンは `components/icons/` にコンポーネントとして作成する
- 定数は `lib/constants/` にコンスタントケースで作成する

### ESLint

`.eslintrc.cjs` のルールに従う。

## アーキテクチャパターン

### API 方針

バックエンド API は **Firebase Cloud Functions**（`apps/functions/src/api.ts`）に集約する。
Next.js の API Routes（`app/api/`）は使わない。

理由: Mobile アプリからも同じ API を呼ぶため。
Next.js の API Routes は Web からしかアクセスできないが、
Cloud Functions なら Web・Mobile・外部サービス（Webhook 等）全てから共通で使える。

### Firebase の使い分け

| 場面                             | ファイル                             | SDK              | 説明                                                             |
| -------------------------------- | ------------------------------------ | ---------------- | ---------------------------------------------------------------- |
| クライアント（ログイン UI 等）   | `apps/web/src/lib/firebase.ts`       | `firebase`       | `'use client'` 必須                                              |
| サーバー（SSR / Server Actions） | `apps/web/src/lib/firebase-admin.ts` | `firebase-admin` | `server-only` で保護。クライアントから import するとビルドエラー |
| Functions                        | `apps/functions/src/`                | `firebase-admin` | `initializeApp()` は `index.ts` で1回のみ                        |

### 認証フロー

```
1. /login ページ（Client Component）で Firebase Auth のログイン
2. middleware.ts でセッション Cookie をチェックしルート保護
3. Server Component では firebase-admin でトークン検証
4. クライアントでは onAuthStateChanged で認証状態を監視
```

参考実装:

- ログインページ: `apps/web/src/app/login/page.tsx`
- ミドルウェア: `apps/web/src/middleware.ts`

### データ取得パターン

Server Component で Firestore からデータを取得する（SSR）:

```typescript
// apps/web/src/app/dashboard/page.tsx
import { adminDb } from '@/lib/firebase-admin';

export default async function DashboardPage() {
  const snapshot = await adminDb.collection('users').limit(10).get();
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return <ul>{users.map(user => <li key={user.id}>{user.id}</li>)}</ul>;
}
```

クライアントでリアルタイム更新が必要な場合のみ `'use client'` + Firebase クライアント SDK を使う。

参考実装: `apps/web/src/app/dashboard/`（page + loading + error セット）

### ページの基本構成

新しいページは以下の3ファイルセットで作る:

```
app/<path>/
├── page.tsx      # メインコンテンツ（Server Component 推奨）
├── loading.tsx   # Suspense 用のローディング UI
└── error.tsx     # エラーバウンダリ（'use client' 必須）
```

### 環境変数の配置

| 種類               | ファイル               | 例                                     |
| ------------------ | ---------------------- | -------------------------------------- |
| Web クライアント用 | `.env.local`（ルート） | `NEXT_PUBLIC_FIREBASE_*`               |
| Mobile 用          | `.env.local`（ルート） | `FIREBASE_*`（app.json の extra 経由） |
| サーバー専用       | `.env.local`（ルート） | `FIREBASE_SERVICE_ACCOUNT_KEY`         |
| Functions 専用     | `apps/functions/.env`  | `REVENUECAT_WEBHOOK_SECRET`            |

`NEXT_PUBLIC_` プレフィックスはブラウザに露出する。サーバー用の値には絶対に付けない。

### 課金（RevenueCat）

| プラットフォーム | ファイル                                   | 用途                       |
| ---------------- | ------------------------------------------ | -------------------------- |
| Mobile           | `apps/mobile/src/lib/revenuecat.ts`        | アプリ内課金               |
| Web              | `apps/web/src/lib/revenuecat.ts`           | Web 課金（`'use client'`） |
| Functions        | `apps/functions/src/revenuecat-webhook.ts` | Webhook → Firestore 同期   |

### コンポーネントの整理方針

```
components/
├── icons/        # アイコンコンポーネント
├── ui/           # 汎用 UI（Button, Modal, Input 等）
├── auth/         # 認証関連（LoginForm, AuthGuard 等）
└── <feature>/    # 機能別（dashboard/, settings/ 等）
```

小規模なうちは `components/` 直下でよい。増えてきたら機能別に分ける。

## スキル（スラッシュコマンド）

| コマンド         | 説明                                       |
| ---------------- | ------------------------------------------ |
| `/new-page`      | Next.js の新規ページ作成                   |
| `/new-component` | React コンポーネント作成                   |
| `/new-function`  | Firebase Cloud Function 追加               |
| `/new-app`       | モノレポに新しいアプリ追加                 |
| `/new-type`      | shared に型定義追加                        |
| `/review`        | プロジェクト構成を前提としたコードレビュー |
| `/deploy`        | デプロイ手順ガイド                         |
| `/new-skill`     | 新しいスキル（スラッシュコマンド）を作成   |

## よく使うコマンド

```bash
yarn setup            # 初回セットアップ
yarn dev:web          # Web 開発サーバー
yarn dev:mobile       # Mobile 開発サーバー
yarn build            # 全ビルド
yarn test             # テスト実行
yarn type-check       # 型チェック
yarn lint             # ESLint
yarn firebase:emulators  # Firebase エミュレーター
```

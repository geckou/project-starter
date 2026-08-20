# アーキテクチャパターン

## API 方針

バックエンド API は **Firebase Cloud Functions**（`apps/functions/src/api.ts`）に集約する。
Next.js の API Routes（`app/api/`）は使わない。

理由: Mobile アプリからも同じ API を呼ぶため。
Next.js の API Routes は Web からしかアクセスできないが、
Cloud Functions なら Web・Mobile・外部サービス（Webhook 等）全てから共通で使える。

**例外**: セッション Cookie の発行・破棄を行う `app/api/session/` のみ API Routes を許可する
（`apps/web/src/app/api/session/route.ts`）。Cookie は Web 固有かつ same-origin で
設定する必要があり、`middleware.ts` のルート保護がこの Cookie を前提とするため。

## Firebase の使い分け

| 場面                             | ファイル                             | SDK              | 説明                                                             |
| -------------------------------- | ------------------------------------ | ---------------- | ---------------------------------------------------------------- |
| クライアント（ログイン UI 等）   | `apps/web/src/lib/firebase.ts`       | `firebase`       | `'use client'` 必須                                              |
| サーバー（SSR / Server Actions） | `apps/web/src/lib/firebase-admin.ts` | `firebase-admin` | `server-only` で保護。クライアントから import するとビルドエラー |
| Functions                        | `apps/functions/src/`                | `firebase-admin` | `initializeApp()` は `index.ts` で1回のみ                        |

## 認証フロー

```
1. /login ページ（Client Component）で Firebase Auth のログイン
2. middleware.ts でセッション Cookie をチェックしルート保護
3. Server Component では firebase-admin でトークン検証
4. クライアントでは onAuthStateChanged で認証状態を監視
```

参考実装:

- ログインページ: `apps/web/src/app/login/page.tsx`
- ミドルウェア: `apps/web/src/middleware.ts`

## データ取得パターン

Server Component で Firestore からデータを取得する（SSR）:

```typescript
// apps/web/src/app/dashboard/page.tsx
import { adminDb } from '@/lib/firebase-admin'

export default async function DashboardPage() {
  const snapshot = await adminDb.collection('users').limit(10).get()
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  return <ul>{users.map(user => <li key={user.id}>{user.id}</li>)}</ul>
}
```

クライアントでリアルタイム更新が必要な場合のみ `'use client'` + Firebase クライアント SDK を使う。

参考実装: `apps/web/src/app/dashboard/`（page + loading + error セット）

## ページの基本構成

新しいページは以下の3ファイルセットで作る:

```
app/<path>/
├── page.tsx      # メインコンテンツ（Server Component 推奨）
├── loading.tsx   # Suspense 用のローディング UI
└── error.tsx     # エラーバウンダリ（'use client' 必須）
```

## 環境変数の配置

| 種類               | ファイル               | 例                                     |
| ------------------ | ---------------------- | -------------------------------------- |
| Web クライアント用 | `.env.local`（ルート） | `NEXT_PUBLIC_FIREBASE_*`               |
| Mobile 用          | `apps/mobile/.env.local`（use-env.sh が配布） | `FIREBASE_*`（app.config.ts の extra 経由） |
| サーバー専用       | `.env.local`（ルート） | `FIREBASE_SERVICE_ACCOUNT_KEY`         |
| Functions 専用     | `apps/functions/.env`（use-env.sh が許可リストのキーのみ生成） | `REVENUECAT_WEBHOOK_AUTH`            |

`NEXT_PUBLIC_` プレフィックスはブラウザに露出する。サーバー用の値には絶対に付けない。

すべての環境変数はルートの `.env.<環境名>` を単一の正とし、`yarn env:<環境名>`
（`scripts/use-env.sh`）が各所へ配布する。`apps/functions/.env` だけは全文コピーではなく、
`FUNCTIONS_ENV_KEYS` の許可リストに載ったキーだけを抽出して生成する。Functions の `.env` は
デプロイ時に関数の環境変数として取り込まれるため、`FIREBASE_SERVICE_ACCOUNT_KEY` のような
不要なサーバー秘密を載せないための措置。**Functions に環境変数を追加したら
`scripts/use-env.sh` の `FUNCTIONS_ENV_KEYS` にも追記すること。**

外部サービスのテスト用キーと本番キーは環境ごとに分ける。`production` 以外に
Stripe の本番キー（`sk_live_` / `rk_live_`）が設定されていると `yarn env:<環境名>` はエラーで停止する。

## 状態管理（Zustand）

グローバル状態は Zustand で管理する。store は `packages/shared/src/stores/` に置き、Web・Mobile で共有する。

```typescript
// 使い方（どのクライアントコンポーネントからでも）
import { useAuthStore } from '@geckou/shared/stores'

const { user, loading } = useAuthStore()
```

| store         | ファイル                                    | 用途             |
| ------------- | ------------------------------------------- | ---------------- |
| `useAuthStore` | `packages/shared/src/stores/auth-store.ts` | 認証状態の管理   |

新しい store を追加する場合は `packages/shared/src/stores/` に作成し、`index.ts` から export する。

## Firebase Storage

ファイルアップロード・ダウンロードのヘルパーは `packages/shared/src/storage/` に集約。

```typescript
import { uploadFile, deleteFile, getFileUrl } from '@geckou/shared/storage'
```

## プッシュ通知（FCM）

| 場面       | ファイル                                       | 用途                          |
| ---------- | ---------------------------------------------- | ----------------------------- |
| Mobile受信 | `apps/mobile/src/lib/push-notifications.ts`    | 権限リクエスト・トークン取得  |
| Server送信 | `apps/functions/src/lib/push-notifications.ts` | FCM 経由で通知送信            |

## エラー監視（Sentry）

| 場所      | ファイル                             | パッケージ             |
| --------- | ------------------------------------ | ---------------------- |
| Web       | `apps/web/src/lib/sentry.ts`        | `@sentry/nextjs`       |
| Mobile    | `apps/mobile/src/lib/sentry.ts`     | `@sentry/react-native` |
| Functions | `apps/functions/src/lib/sentry.ts`  | `@sentry/node`         |

※ Sentry パッケージインストール後、各ファイルの import 行に付いている
`// @ts-ignore` と直上の `// eslint-disable-next-line` の2行を削除すること。

## i18n（多言語対応）

翻訳ファイルは `packages/shared/src/i18n/` に集約。Web・Mobile で共有する。

```typescript
import { getTranslation, ja, en } from '@geckou/shared/i18n'

getTranslation(ja, 'common.loading') // → '読み込み中...'
```

新しい翻訳キーを追加する場合は `ja.ts` と `en.ts` の両方に追加すること。

## 課金（RevenueCat）

| プラットフォーム | ファイル                                   | 用途                       |
| ---------------- | ------------------------------------------ | -------------------------- |
| Mobile           | `apps/mobile/src/lib/revenuecat.ts`        | アプリ内課金               |
| Web              | `apps/web/src/lib/revenuecat.ts`           | Web 課金（`'use client'`） |
| Functions        | `apps/functions/src/revenuecat-webhook.ts` | Webhook → Firestore 同期   |

## Tailwind CSS / デザイントークン

デザイントークン（色・フォント・角丸等）は `packages/shared/src/theme/index.ts` に集約し、Web・Mobile の両方の Tailwind 設定から参照している。

| 項目 | Web | Mobile |
|---|---|---|
| Tailwind バージョン | v4 (`@tailwindcss/postcss`) | v3 (NativeWind v4 が v3 に依存) |
| 設定ファイル | `apps/web/tailwind.config.ts` | `apps/mobile/tailwind.config.js` |
| 共有テーマ | `@geckou/shared/theme` を import | `@geckou/shared/theme` を require |

**バージョンが異なるのは意図的。** NativeWind v4 は Tailwind v4 に未対応のため v3 を使う。共有テーマを JS オブジェクトで定義することで、どちらの config 形式にも対応できている。

新しいトークン（spacing、shadow 等）を追加する場合は `packages/shared/src/theme/index.ts` に追加すれば両方に反映される。

## コンポーネントの整理方針

```
components/
├── icons/        # アイコンコンポーネント
├── ui/           # 汎用 UI（Button, Modal, Input 等）
├── auth/         # 認証関連（LoginForm, AuthGuard 等）
└── <feature>/    # 機能別（dashboard/, settings/ 等）
```

小規模なうちは `components/` 直下でよい。増えてきたら機能別に分ける。

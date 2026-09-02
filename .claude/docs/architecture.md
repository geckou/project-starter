# アーキテクチャパターン

> このドキュメントは**全部入りの構成**（core + firebase + functions + mobile + billing）を前提に書いている。
> どの層が何を持ち込むかは `.claude/docs/layers.md` と `layers.json` を参照。
> 層を外した構成では、その層に属するセクションは読み飛ばしてよい。

## API 方針

バックエンド API は **Firebase Cloud Functions**（`apps/functions/src/api.ts`）に集約する。
Next.js の API Routes（`app/api/`）は使わない。

理由: Mobile アプリからも同じ API を呼ぶため。
Next.js の API Routes は Web からしかアクセスできないが、
Cloud Functions なら Web・Mobile・外部サービス（Webhook 等）全てから共通で使える。

**例外**: セッション Cookie の発行・破棄を行う `app/api/session/` のみ API Routes を許可する
（`apps/web/src/app/api/session/route.ts`）。Cookie は Web 固有かつ same-origin で
設定する必要があり、`middleware.ts` のルート保護がこの Cookie を前提とするため。

### functions 層を含まない構成

この規約は**全構成で共通**とする。構成によって API の書き方が変わると、
後から Mobile を足すときに API を移植し直すことになり、`/new-function` も使えなくなるため。

`apps/functions` を持たない構成（core / core + firebase）は、**API を持たない**。
API・Firestore / Auth トリガー・スケジュール実行のいずれかが必要になった時点で
functions 層を足す（`/add-functions`）。「API Routes で代用する」という選択肢は取らない。

なお `hosting.frameworksBackend` による SSR 用の関数は、framework アダプタが自動生成して
Cloud Functions (2nd gen) にデプロイするもので、`apps/functions` とは別物。
core の時点で存在し、Blaze プランもこの時点で必須になる。

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
| Functions 専用     | `apps/functions/.env`（use-env.sh が許可リストのキーのみ生成） | `STRIPE_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH` |

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

### アップロードの制限（`storage.rules`）

`users/{uid}/**` への書き込みは本人のみで、さらに次の 2 つを満たすものに限る。

| 制限 | 値 | 理由 |
| --- | --- | --- |
| サイズ | 10MB 未満 | 無制限だと課金と悪用の入口になる |
| 種別 | `image/*` | 参照実装の想定（アバター・写真） |

画像以外も置くプロジェクトは `contentType` の条件を広げる。削除は
`request.resource` を持たないため、この 2 条件を課さない（`allow delete` を別に書く）。
拒否ケースは `tests/storage-rules.test.ts` にあり、`yarn test:rules` で検証する。

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

※ Sentry パッケージのインストール後、各ファイル先頭の抑制コメントを削除すること。
Functions / Mobile は `// @ts-nocheck` の 1 行、Web は `// @ts-ignore` と
直上の `// eslint-disable-next-line` の 2 行。

## i18n（多言語対応）

翻訳ファイルは `packages/shared/src/i18n/` に集約。Web・Mobile で共有する。

```typescript
import { getTranslation, ja, en } from '@geckou/shared/i18n'

getTranslation(ja, 'common.loading') // → '読み込み中...'
```

新しい翻訳キーを追加する場合は `ja.ts` と `en.ts` の両方に追加すること。

## 課金

> セットアップ・実装の手順は `.claude/docs/billing.md` を参照。ここでは構成と設計判断のみ扱う。

### 方針: モバイルは IAP、Web は Stripe

購入経路を2つ持ち、**権利状態は Firestore の `users/{uid}.subscription` に一本化する**。

| 経路 | 決済手段 | 手数料 | 用途 |
| --- | --- | --- | --- |
| Mobile アプリ内 | IAP（RevenueCat 経由） | Apple 26% / Google 30%（中小 15%） | アプリ内でその場で買わせたいプロダクト |
| Web（ブラウザ） | Stripe | 3.6% 前後 | LP・Web サービスから契約させる |

**なぜこの形か。** アプリ内課金は Face ID の1タップで完結するためコンバージョンが圧倒的に高い一方、
手数料が最も重い。逆に Web からの直接契約はストアが一切関与しないため、手数料はカード決済分だけで済む。
「アプリでは取りこぼさない、Web に来た人からは安く取る」を両立させるのがこの構成の狙い。

**リンクアウト（アプリ内から Web 決済へ誘導）は採用していない。**
2025年12月施行のスマホ新法で日本でも解禁されたが、Apple 15% / Google 20% のストア手数料が別途かかるうえ、
Apple / Google への月次の取引報告（External Purchase Server API / external payments API）を
恒久的に運用する義務が発生するため、割に合わない。採用する場合はその報告基盤の実装が別途必要になる。

### どちらか一方だけ使う

両方とも環境変数が未設定なら無効になるので、プロダクトに応じて片方だけ使える。

- **Web だけで売る**: `STRIPE_*` のみ設定。RevenueCat の依存は mobile 側に残るが未初期化で無害
- **アプリ内課金だけ**: `REVENUECAT_*` のみ設定。`/billing/*` エンドポイントは 503 を返す

### ファイル構成

決済ロジックの本体は **[`@geckou/billing`](https://github.com/geckou/kit)**（npm パッケージ）にある。
権利状態の反映（冪等性・順序制御）・Stripe / RevenueCat Webhook・Checkout / ポータル作成・
カスタムクレーム同期はパッケージ側で実装され、修正は Renovate の更新 PR として届く
（`renovate.json5`。→ `.claude/docs/dependencies.md`）。
リポジトリ内に残るのは配線と、プロジェクトごとに編集するフックのみ。

| 層 | ファイル | 役割 |
| --- | --- | --- |
| 共有 | `packages/shared/src/billing/index.ts` | `@geckou/billing/entitlement` の re-export（`isSubscriptionActive` / `hasPlan` / `Subscription` 型） |
| Functions | `apps/functions/src/lib/billing.ts` | `createBilling()` の配線（env・firebase-admin・フックの注入） |
| Functions | `apps/functions/src/lib/entitlement-hooks.ts` | 権利変化フック（**派生プロジェクトが編集する場所**） |
| Functions | `apps/functions/src/api.ts` | Webhook / `/billing/*` の Express アダプタ |
| Web | `apps/web/src/lib/billing.ts` | Checkout / カスタマーポータルの起動 |
| Web | `apps/web/src/app/billing/page.tsx` | 購入・管理画面の参考実装 |
| Mobile | `apps/mobile/src/lib/revenuecat.ts` | IAP の初期化・Firebase UID との紐付け |

### 権利状態の判定

画面側は経路を意識せず、共有ヘルパーだけを見る。

```typescript
import { isSubscriptionActive } from '@geckou/shared'

if (isSubscriptionActive(user.subscription)) {
  // 有料機能を出す
}
```

`status` は4種類。`cancelled` は「自動更新が止まっただけ」で `currentPeriodEnd` までは利用できる点に注意
（`isSubscriptionActive` がこの判定を吸収する）。

| status | 意味 | 利用可否 |
| --- | --- | --- |
| `active` | 有効 | 可 |
| `in_grace_period` | 支払い失敗中（リトライ猶予期間。Stripe の `past_due` / RevenueCat の `BILLING_ISSUE`） | `currentPeriodEnd` があればその日時まで可（無ければ可） |
| `cancelled` | 自動更新が停止 | `currentPeriodEnd` まで可 |
| `expired` | 失効 | 不可 |

### セキュリティ上の要点

- **`subscription` と `stripeCustomerId` はクライアントから書き込めない**（`firestore.rules` で拒否）。
  これが無いとユーザーが自分を `active` に書き換えて有料機能を使えてしまう
- **Webhook は冪等**。処理済みイベントを `billing_events/{source}_{eventId}` に記録し、
  再送を二重適用しない。反映済みより古いイベントでの上書きも防ぐ
- **Stripe の署名検証には生のボディが必要**。`api.ts` で `express.json()` より前に
  `express.raw()` を通している（順序を入れ替えると検証が必ず失敗する）
- **購入可能な price はサーバー側の許可リスト**（`STRIPE_PRICE_IDS`）で検証する
- **ルールから権利状態を参照したい場合のみ** `SYNC_SUBSCRIPTION_CLAIMS=true` を設定する。
  Webhook が Firebase Auth のカスタムクレームにも同期し、`request.auth.token.subscriptionActive`
  で判定できるようになる（デフォルトは無効。画面の表示制御だけなら Firestore を読めば足りる）
- **Checkout の戻り先 URL は環境変数で固定**（クライアント入力を使うとオープンリダイレクトになる）

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

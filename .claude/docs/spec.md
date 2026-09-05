# 仕様書

> 技術仕様の正（single source of truth）。
> 画面一覧・データモデル・API・セキュリティ・外部サービス連携を定義する。
> プロダクト背景・ターゲットは `planning.md` を参照。

---

## 1. 画面一覧

### 1-1. Web

<!-- 「関連機能」には roadmap.md の機能ステータス表の機能名を記入する（機能→仕様の逆引き用） -->

| 階層 | URL | 画面名 | 概要 | 認証 | 関連機能 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| 公開 | `/` | トップ | | 不要 | | |
| 公開 | `/login` | ログイン | | 不要 | | |
| 要認証 | `/dashboard` | ダッシュボード | | 必要 | | middleware は Cookie 存在チェックのみ。実検証（verifySessionCookie）はページ側 |
| 要認証 | `/billing` | 課金 | 購読状態の表示と Checkout / ポータルへの導線（アプリ内課金で契約中のユーザーには Stripe ポータルの導線を出さず、ストアの設定画面への注記だけを出す） | 必要 | | billing 層。層を外すと消える |
| 公開 | `/ui-demo` | UI デモ | `@geckou/ui-react` の表示確認用。派生プロジェクトでは削除してよい | 不要 | | |

### 1-2. Mobile

| 画面 | パス | 概要 | 認証 | 関連機能 | 備考 |
| --- | --- | --- | --- | --- | --- |

---

## 2. データモデル

### コレクション一覧

| コレクション | パス | 説明 | 関連機能 |
| --- | --- | --- | --- |
| ユーザー | `users/{uid}` | 本人のみ読み書き可。`subscription` / `stripeCustomerId` はサーバー専用（`firestore.rules`） | |
| 課金イベント | `billing_events/{eventId}` | Webhook の処理済みイベント（冪等性のため Functions のみが書く。クライアントからは読み書き不可） | billing 層 |

### スキーマ詳細

<!-- 各コレクションの型定義を記述 -->

---

## 3. API エンドポイント一覧

すべて `apps/functions/src/api.ts`（`/api` 配下）。

| メソッド | パス | 概要 | 認証 | 関連機能 | リクエスト | レスポンス |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/health` | 死活確認 | 不要 | | | `{ status: 'ok' }` |
| GET | `/me` | サインイン中の uid を返す（認証付きの例） | 必要 | | | `{ uid }` |
| POST | `/billing/checkout` | Stripe Checkout のセッションを作る | 必要 | billing 層 | `{ priceId }` | `{ url }` |
| POST | `/billing/portal` | Stripe カスタマーポータルの URL を返す | 必要 | billing 層 | | `{ url }` |
| POST | `/webhooks/stripe` | Stripe Webhook（署名検証あり） | 署名 | billing 層 | Stripe のイベント | `{ received: true }` |
| POST | `/webhooks/revenuecat` | RevenueCat Webhook（Authorization ヘッダー検証） | ヘッダー | billing 層 | RevenueCat のイベント | `{ received: true }` |

Next.js 側の Route Handler は `POST/DELETE /api/session`（セッション cookie の発行・破棄）のみ。
アプリの API は `apps/functions` に置く（→ `.claude/docs/architecture.md`）。

---

## 4. セキュリティルール方針

<!-- Firestore ルールの方針を記述 -->

---

## 5. 外部サービス連携

| サービス | 用途 | 環境変数 | 備考 |
| --- | --- | --- | --- |

---

## 6. TypeScript スキーマ・Firestore パス設計

<!-- packages/shared/src/types/ に定義する型の一覧・パス設計 -->

---

## 7. 設計決定事項

<!-- アーキテクチャ上の重要な判断とその理由を記録 -->

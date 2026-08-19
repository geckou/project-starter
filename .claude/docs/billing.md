# 決済の実装手順

> 決済まわりを**手順どおりに進めれば動く状態にする**ための実務ドキュメント。
> 「なぜこの構成なのか」「何がどう動いているのか」は `architecture.md` の「課金」を参照。

---

## 0. まず構成を決める

購入経路は2つあり、**それぞれ独立して有効化できる**。環境変数を入れなかった経路は無効になる。

| 構成 | 設定する環境変数 | こういうプロダクト |
| --- | --- | --- |
| **Web のみ** | `STRIPE_*` | Web サービス、PC で使うツール、モバイルアプリが無い |
| **IAP のみ** | `REVENUECAT_*` | アプリ内でその場で買わせたい、Web の販売導線を作らない |
| **両方** | 両方 | モバイルは CVR 重視で IAP、Web 流入は手数料 3.6% で獲得 |

迷ったら **Web のみ**から始める。IAP はストア申請・審査が絡むぶん立ち上げが重い。

> **アプリ内から Web 決済へのリンクアウトはこのテンプレートでは扱わない。**
> スマホ新法（2025年12月施行）で日本でも解禁されたが、Apple 15% / Google 20% の
> ストア手数料に加えて、Apple / Google への月次の取引報告を恒久的に運用する義務が生じる。
> 採用する場合はその報告基盤の設計から必要になる。

---

## 1. Stripe（Web 決済）を有効にする

### 1-1. Stripe 側の設定

すべて **テストモード**で行い、本番移行時に同じ手順を本番モードで繰り返す。

1. **商品と価格を作る**
   Stripe Dashboard > 商品カタログ > 商品を追加 。
   継続課金なら「継続」を選ぶ。作成後に表示される **price ID（`price_...`）を控える**。
   （商品 ID `prod_...` ではない。間違えやすい）

2. **カスタマーポータルを有効化する**
   Stripe Dashboard > 設定 > Billing > カスタマーポータル で「有効化」。
   **ここを忘れると `/billing/portal` が 500 になる。** プラン変更を許可するなら、
   ポータルの設定画面で対象の商品を登録しておく。

3. **Webhook を登録する**（Functions のデプロイ後に行う）
   Stripe Dashboard > 開発者 > Webhook > エンドポイントを追加:

   ```
   https://<region>-<project-id>.cloudfunctions.net/api/webhooks/stripe
   ```

   送信するイベントに以下の4つを選ぶ:

   | イベント | 用途 |
   | --- | --- |
   | `checkout.session.completed` | 顧客 ID を users に保存する |
   | `customer.subscription.created` | 初回購入を反映 |
   | `customer.subscription.updated` | 更新・解約予約・支払い失敗を反映 |
   | `customer.subscription.deleted` | 失効を反映 |

   登録後に表示される **署名シークレット（`whsec_...`）を控える**。

### 1-2. 環境変数を設定する

`apps/functions/.env`（`apps/functions/.env.example` からコピー）:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
# 購入を許可する price ID。ここに無い price はサーバーが 400 で拒否する
STRIPE_PRICE_IDS=price_xxx,price_yyy
STRIPE_SUCCESS_URL=https://example.com/billing?status=success
STRIPE_CANCEL_URL=https://example.com/billing?status=cancelled
STRIPE_PORTAL_RETURN_URL=https://example.com/billing
```

ルートの `.env.<環境名>`:

```bash
NEXT_PUBLIC_STRIPE_PRICE_ID=price_xxx
```

> `STRIPE_SECRET_KEY` に `NEXT_PUBLIC_` を**絶対に付けない**。ブラウザに漏れる。
> `NEXT_PUBLIC_STRIPE_PRICE_ID` は公開されても問題ない値（購入可否はサーバーの許可リストで決まる）。

### 1-3. ローカルで動作確認する

```bash
# 1. Functions を起動
yarn dev:functions

# 2. 別ターミナルで Stripe CLI から Webhook を転送する
stripe listen --forward-to \
  http://localhost:5001/<project-id>/asia-northeast1/api/webhooks/stripe
# 表示された whsec_... を apps/functions/.env の STRIPE_WEBHOOK_SECRET に入れて再起動

# 3. Web を起動して /billing から購入
yarn dev:web
```

テストカードは `4242 4242 4242 4242`（有効期限は未来の日付、CVC は任意の3桁）。

購入後、Firestore の `users/{uid}.subscription` が `status: 'active'` になっていれば成功。

### 1-4. 本番へ

1. 本番モードで 1-1 をやり直す（price ID も Webhook シークレットも別物になる）
2. `yarn env:production` で環境を切り替え、`yarn deploy:production`
3. Webhook のエンドポイント URL を本番の Functions に向ける
4. **特定商取引法に基づく表記**のページを用意する（日本で有料サービスを提供する場合は必須）

---

## 2. RevenueCat（アプリ内課金 / IAP）を有効にする

### 2-1. ストア側の準備

先にこちらが必要。審査が絡むので時間がかかる。

1. App Store Connect / Google Play Console で **サブスクリプション商品を作成**
2. 契約・税務・銀行情報を登録（未登録だと商品が有効にならない）

### 2-2. RevenueCat 側の設定

1. RevenueCat Dashboard でプロジェクトを作成し、iOS / Android アプリを登録
2. **Entitlement を作る**（例: `pro`）。これが `subscription.planId` に入る
3. ストアの商品を Entitlement に紐付ける
4. **Offering** を作って商品を並べる（アプリ側の購入画面が読む）
5. API キー（Apple / Google）を控える

### 2-3. 環境変数を設定する

ルートの `.env.<環境名>`:

```bash
REVENUECAT_API_KEY_APPLE=appl_...
REVENUECAT_API_KEY_GOOGLE=goog_...
```

`apps/functions/.env`:

```bash
# RevenueCat Dashboard > Integrations > Webhooks で設定する任意の文字列
REVENUECAT_WEBHOOK_AUTH=Bearer <任意の長いランダム文字列>
```

### 2-4. Webhook を登録する

RevenueCat Dashboard > Integrations > Webhooks:

```
https://<region>-<project-id>.cloudfunctions.net/api/webhooks/revenuecat
```

Authorization header value に `REVENUECAT_WEBHOOK_AUTH` と**同じ値**を設定する。

> RevenueCat の Webhook は HMAC 署名ではなく、この固定値をそのまま送ってくる方式。

### 2-5. アプリ側の初期化を入れる

**`apps/mobile/src/app/_layout.tsx` で初期化し、ログイン時に uid を紐付ける。**

```tsx
import { useEffect } from 'react'

import { initializeRevenueCat, loginRevenueCat } from '@/lib/revenuecat'

export default function RootLayout() {
  useEffect(() => {
    initializeRevenueCat()
  }, [])

  // 認証状態が確定したら uid を紐付ける
  useEffect(() => {
    if (user) loginRevenueCat(user.uid)
  }, [user])

  // ...
}
```

> **`loginRevenueCat(uid)` は必須。** これを呼ばないと RevenueCat の `app_user_id` が
> 匿名 ID のままになり、Webhook 側で「誰の購入か」を特定できず権利が反映されない。
> ログアウト時は `logoutRevenueCat()` を呼ぶ。

購入画面は `getOfferings()` で商品を取得して表示する。Paywall UI を作り込みたくない場合は
`react-native-purchases-ui`（インストール済み）の Paywall が使える。

---

## 3. プロダクト側に権利判定を入れる

### 3-1. 画面での判定

経路（Stripe / IAP）を意識せず、共有ヘルパーだけを見る。

```typescript
import { isSubscriptionActive } from '@geckou/shared'

if (isSubscriptionActive(user.subscription)) {
  // 有料機能を出す
}

// プランを分けている場合
import { hasPlan } from '@geckou/shared'

if (hasPlan(user.subscription, 'pro')) { /* ... */ }
```

**`status === 'active'` で直接判定しないこと。** `cancelled`（自動更新が止まっただけ）
でも課金期間の終了までは使えるため、この判定はヘルパーに任せる。

| status | 意味 | 利用可否 |
| --- | --- | --- |
| `active` | 有効 | 可 |
| `in_grace_period` | 支払い失敗中（リトライ猶予期間） | 可 |
| `cancelled` | 自動更新が停止 | `currentPeriodEnd` まで可 |
| `expired` | 失効 | 不可 |

### 3-2. セキュリティルールでの判定

Webhook がカスタムクレームにも同期しているので、Firestore の `get()` なしで書ける。

```javascript
match /premium_items/{itemId} {
  allow write: if request.auth != null
               && request.auth.token.subscriptionActive == true;
}
```

**クレームは ID トークンが更新されるまで最大1時間古い。** 購入直後に反映させたい画面では
`refreshEntitlement()`（`apps/web/src/lib/billing.ts`）を呼ぶ。
`STRIPE_SUCCESS_URL` の戻り先で1回呼んでおくのが定石。

### 3-3. ダウングレード時の後始末を書く

**ここは実装を忘れやすいが、実運用では必須。**
解約されたときに、有料プランで作ったデータを無料プランの制限に収める処理を入れる。

`apps/functions/src/lib/entitlement-hooks.ts` を編集する:

```typescript
export async function onSubscriptionDowngraded(
  uid: string,
  subscription: Subscription
): Promise<void> {
  const db = getFirestore()
  const snapshot = await db.collection('items').where('uid', '==', uid).get()

  // 一括で無効化（削除ではなく enabled: false のほうが復帰時に安全）
  await Promise.all(snapshot.docs.map((doc) => doc.ref.update({ enabled: false })))

  // 無料プランの上限（例: 3件）を超えた分は、更新日の新しい順に残して削除
  const sorted = snapshot.docs.sort(/* updatedAt の降順 */)
  await Promise.all(sorted.slice(3).map((doc) => doc.ref.delete()))
}
```

`onSubscriptionUpgraded` は逆に、再契約時の復帰処理を書く場所。

これらは Firestore のトランザクション確定後に呼ばれるので、時間のかかる処理を書いてよい。
ここで例外を投げても Webhook は 500 にならない（権利状態の反映自体は既に確定しているため）。
失敗時はログに残るので監視すること。

### 3-4. プランを増やす

1. Stripe で price を追加 → `STRIPE_PRICE_IDS` に**カンマ区切りで追記**
2. IAP なら RevenueCat で Entitlement を追加
3. 画面側は `hasPlan(subscription, '<planId>')` で分岐

`planId` には Stripe なら price ID、RevenueCat なら entitlement ID が入る。
経路をまたいで同じプランを表現したい場合は、画面側でマッピングを持つ。

---

## 4. テスト

```bash
yarn test        # 型・Webhook・権利判定のユニットテスト
yarn test:rules  # Firestore ルール（要 Firebase エミュレーター）
```

決済まわりに手を入れたら、最低限これらが通ること:

| 対象 | 確認すること |
| --- | --- |
| Webhook | 署名検証の失敗、冪等性（再送で二重適用しない）、古いイベントで巻き戻らない |
| エンドポイント | 認証エラー、許可リスト外の price を拒否 |
| ルール | `subscription` / `stripeCustomerId` をクライアントが書き換えられない |
| 権利判定 | `cancelled` が期間内は有効、期間後は無効 |

---

## 5. 完了チェックリスト

- [ ] `yarn type-check` / `yarn lint` / `yarn test` / `yarn test:rules` が通る
- [ ] `spec.md` の「外部サービス連携」に Stripe / RevenueCat と環境変数を記載した
- [ ] `spec.md` のデータモデルに `users.subscription` を記載した
- [ ] 権利判定を `isSubscriptionActive` 経由にした（`status === 'active'` の直接判定が残っていない）
- [ ] `onSubscriptionDowngraded` に後始末を実装した（不要ならその判断を記録した）
- [ ] 購入完了画面で `refreshEntitlement()` を呼んでいる（クレームをルールで使う場合）
- [ ] 特定商取引法に基づく表記を用意した（日本で有料提供する場合）
- [ ] 本番モードの price ID / Webhook シークレットに差し替えた
- [ ] `roadmap.md` の機能ステータス表を更新した

---

## 6. よくある失敗

| 症状 | 原因 |
| --- | --- |
| Webhook が常に 400 `Invalid signature` | `api.ts` で `express.json()` より前に `express.raw()` を通す順序が崩れている。または `STRIPE_WEBHOOK_SECRET` がローカル用（`stripe listen` が出す値）と本番用で取り違えられている |
| 購入は成功するが権利が反映されない | Webhook のイベント選択に `customer.subscription.*` が入っていない。ログに `Stripe subscription without uid metadata` が出ていれば、Checkout 作成時の `subscription_data.metadata` が欠けている |
| `/billing/checkout` が 400 `Invalid priceId` | `STRIPE_PRICE_IDS` に該当の price ID が入っていない。商品 ID（`prod_...`）を入れていないか確認 |
| `/billing/portal` が 500 | Stripe Dashboard でカスタマーポータルを有効化していない |
| `/billing/portal` が 404 | そのユーザーが Stripe で一度も購入しておらず顧客が存在しない。IAP で購入したユーザーはこちら（ストアの設定画面へ誘導する） |
| `/billing/*` が 503 | `STRIPE_SECRET_KEY` が未設定。Web 決済を使わない構成なら正常な挙動 |
| IAP の購入が反映されない | `loginRevenueCat(uid)` を呼んでおらず、`app_user_id` が Firebase の uid になっていない |
| ルールで弾かれる / 通ってしまう | カスタムクレームが古い。`refreshEntitlement()`（`getIdToken(true)`）で更新する |

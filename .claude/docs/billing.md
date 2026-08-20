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

**ルートの `.env.<環境名>` に書く。**ここが単一の正で、`yarn env:<環境名>` が
`apps/functions/.env` を含む各所へ配布する（`apps/functions/.env` を直接編集しても
環境切り替えで上書きされる）。

```bash
# Functions が使う（yarn env:<環境名> が apps/functions/.env へ配布する）
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
# 購入を許可する price ID。ここに無い price はサーバーが 400 で拒否する
STRIPE_PRICE_IDS=price_xxx,price_yyy
STRIPE_SUCCESS_URL=https://example.com/billing?status=success
STRIPE_CANCEL_URL=https://example.com/billing?status=cancelled
STRIPE_PORTAL_RETURN_URL=https://example.com/billing

# Web クライアントが使う
NEXT_PUBLIC_STRIPE_PRICE_ID=price_xxx
```

設定したら環境を切り替えて配布する。

```bash
yarn env:develop
```

> `STRIPE_SECRET_KEY` に `NEXT_PUBLIC_` を**絶対に付けない**。ブラウザに漏れる。
> `NEXT_PUBLIC_STRIPE_PRICE_ID` は公開されても問題ない値（購入可否はサーバーの許可リストで決まる）。

**Functions に環境変数を追加したときは `scripts/use-env.sh` の `FUNCTIONS_ENV_KEYS`
にも追記すること。**許可リストに無いキーは `apps/functions/.env` に配布されない。

### 1-3. テストモードと本番モードを分ける

**Stripe のテスト/本番はキーで決まる。**`sk_test_` を使えばその環境は全部テストモードで動く。
別途フラグを立てる必要はない。

| 環境 | Stripe キー | 使う場面 |
| --- | --- | --- |
| `.env.develop` | `sk_test_...` | ローカル開発 |
| `.env.staging` | `sk_test_...` | 動作確認・受け入れ |
| `.env.production` | `sk_live_...` | 本番 |

`yarn env:<環境名>` は **production 以外に本番キー（`sk_live_`）が入っているとエラーで停止する。**
開発中の操作が実在するカードに課金される事故を防ぐため。

**テストモードと本番モードは完全に別世界。** price ID・顧客・サブスクリプション・Webhook
エンドポイントがすべて別なので、`STRIPE_PRICE_IDS` と `NEXT_PUBLIC_STRIPE_PRICE_ID` も
モードごとに違う値になる。取り違えると `/billing/checkout` が `Invalid priceId` で 400 を返す。

**Webhook シークレットは3種類ある。** それぞれ別物なので取り違えないこと。

| 用途 | 取得元 | 書く先 |
| --- | --- | --- |
| ローカル開発 | `stripe listen` が起動時に表示する値 | `.env.develop` |
| テストモードのデプロイ先 | Dashboard（テストモード）の Webhook 設定 | `.env.staging` |
| 本番 | Dashboard（本番モード）の Webhook 設定 | `.env.production` |

#### Test Clock でサブスクの時間を進める

更新・支払い失敗・期限切れは、実際には数週間〜数か月待たないと起きない。
Stripe の **Test Clock**（テストモード限定）を使うと時間を進めて即座に再現できる。
今回実装した Webhook の分岐を一通り確認するのに使う。

```bash
# 1. テストクロックを作る（現在時刻で作成）
stripe test_helpers test_clocks create --frozen-time $(date +%s)

# 2. そのクロックに紐づく顧客を作り、Checkout でサブスクを契約する
#    （Dashboard のテストクロック画面からも顧客を作れる）

# 3. 時間を進める（例: 32日後 = 更新が発生する）
stripe test_helpers test_clocks advance --id clock_xxx --frozen-time <unix秒>
```

これで確認できる遷移:

| 進める内容 | 発火するイベント | 期待する `status` |
| --- | --- | --- |
| 課金期間を1つ進める | `customer.subscription.updated` | `active`（更新成功） |
| 決済失敗するカードで更新 | `customer.subscription.updated` | `in_grace_period` |
| リトライ期間を過ぎる | `customer.subscription.deleted` | `expired` |
| 解約して期間終了まで進める | `customer.subscription.updated` → `deleted` | `cancelled` → `expired` |

`cancelled` は期間終了までは `isSubscriptionActive` が `true` を返す点も、
ここで実際に確認しておくとよい。

#### テストカード

| 番号 | 挙動 |
| --- | --- |
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 0341` | 登録は通るが決済時に失敗（更新失敗の再現に使う） |
| `4000 0000 0000 9995` | 残高不足 |
| `4000 0025 0000 3155` | 3D セキュア認証が必要 |

有効期限は未来の日付、CVC は任意の3桁でよい。

### 1-4. ローカルで動作確認する

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

### 1-5. 本番へ

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

> **IAP のテストは Stripe と仕組みが違う。** RevenueCat 側にテストキーは無く、
> App Store の Sandbox アカウント / Google Play の内部テストトラックで検証する。
> Sandbox では更新周期が短縮される（例: 月額が数分で更新される）ため、
> `RENEWAL` や `EXPIRATION` の Webhook を現実的な時間で確認できる。

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

### 3-2. セキュリティルールでの判定（任意）

**画面の表示制御しかしないなら、この節は不要。**Firestore の
`users/{uid}.subscription` を読めば足りる。

Firestore やStorage の**ルールで課金状態を条件にしたい場合**だけ、
カスタムクレームへの同期を有効にする。

```bash
# apps/functions/.env
SYNC_SUBSCRIPTION_CLAIMS=true
```

有効にすると Webhook が権利状態をカスタムクレームにも書くので、
ルールから Firestore の `get()` なしで参照できる（読み取りコストがかからない）。

```javascript
match /premium_items/{itemId} {
  allow write: if request.auth != null
               && request.auth.token.subscriptionActive == true;
}
```

**クレームは ID トークンが更新されるまで最大1時間古い。** 購入直後に反映させたい画面では
`refreshEntitlement()`（`apps/web/src/lib/billing.ts`）を呼ぶ。
`STRIPE_SUCCESS_URL` の戻り先で1回呼んでおくのが定石。

> 同期を有効にすると Webhook イベントごとに Auth の読み書きが1往復増える。
> イベント頻度を考えれば無視できるコストだが、使わないなら有効にしないこと。

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
- [ ] ルールで課金状態を使うなら `SYNC_SUBSCRIPTION_CLAIMS=true` を設定し、購入完了画面で `refreshEntitlement()` を呼んでいる
- [ ] 特定商取引法に基づく表記を用意した（日本で有料提供する場合）
- [ ] 開発・検証環境がテストキー（`sk_test_`）を使っている
- [ ] Test Clock で更新・支払い失敗・失効の遷移を確認した
- [ ] 本番モードの price ID / Webhook シークレットに差し替えた
- [ ] `roadmap.md` の機能ステータス表を更新した

---

## 6. よくある失敗

| 症状 | 原因 |
| --- | --- |
| Webhook が常に 400 `Invalid signature` | `api.ts` で `express.json()` より前に `express.raw()` を通す順序が崩れている。または `STRIPE_WEBHOOK_SECRET` がローカル用（`stripe listen` が出す値）と本番用で取り違えられている |
| 購入は成功するが権利が反映されない | Webhook のイベント選択に `customer.subscription.*` が入っていない。ログに `Stripe subscription without uid metadata` が出ていれば、Checkout 作成時の `subscription_data.metadata` が欠けている |
| `/billing/checkout` が 400 `Invalid priceId` | `STRIPE_PRICE_IDS` に該当の price ID が入っていない。商品 ID（`prod_...`）を入れていないか確認 |
| price ID は合っているのに Stripe 側で `No such price` | テストモードで作った price を本番キーで使っている（またはその逆）。price ID はモードごとに別物 |
| `yarn env:develop` がエラーで止まる | `.env.develop` に本番キー（`sk_live_`）が入っている。テストキーに差し替える |
| 環境を切り替えたのに Functions が前の環境を見ている | Functions に追加した環境変数が `scripts/use-env.sh` の `FUNCTIONS_ENV_KEYS` に入っていない |
| `/billing/portal` が 500 | Stripe Dashboard でカスタマーポータルを有効化していない |
| `/billing/portal` が 404 | そのユーザーが Stripe で一度も購入しておらず顧客が存在しない。IAP で購入したユーザーはこちら（ストアの設定画面へ誘導する） |
| `/billing/*` が 503 | `STRIPE_SECRET_KEY` が未設定。Web 決済を使わない構成なら正常な挙動 |
| IAP の購入が反映されない | `loginRevenueCat(uid)` を呼んでおらず、`app_user_id` が Firebase の uid になっていない |
| ルールで `subscriptionActive` が常に未定義で全員弾かれる | `SYNC_SUBSCRIPTION_CLAIMS=true` を設定していない。デフォルトは無効 |
| ルールで弾かれる / 通ってしまう | カスタムクレームが古い。`refreshEntitlement()`（`getIdToken(true)`）で更新する |

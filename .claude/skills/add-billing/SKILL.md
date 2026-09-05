---
name: add-billing
description: billing 層（Stripe / RevenueCat の配線と課金画面）をプロジェクトに足す
---

# add-billing

**billing 層**を足す。権利判定と Webhook 処理の実装は
[`@geckou/billing`](https://www.npmjs.com/package/@geckou/billing)（`geckou/kit`）にあり、
この層に入るのは**配線と課金画面、そしてプロダクト固有の権利変化フックだけ**。

層の考え方は `.claude/docs/layers.md`、決済の実装手順の詳細は `.claude/docs/billing.md` を参照。

## 1. 配線する（スクリプト）

```bash
node scripts/add-layer.mjs billing --dry-run
node scripts/add-layer.mjs billing
yarn install
yarn format
```

前提の firebase / functions 層が無ければ一緒に足される。

スクリプトが入れるもの:

| 区分 | 中身 |
| --- | --- |
| ファイル | web: `app/billing/` / `components/billing/` / `lib/billing.ts`、functions: `lib/billing.ts`（配線）/ `lib/entitlement-hooks.ts`、shared: `billing/`（権利判定の re-export）、mobile がある場合: `lib/revenuecat.ts` |
| 依存 | `@geckou/billing` / `stripe`、esbuild の `--external:stripe` |
| ルート | `api.ts` に Webhook 2本（`/webhooks/stripe` `/webhooks/revenuecat`）と `/billing/checkout` `/billing/portal` |
| env | `STRIPE_*` 一式 / `NEXT_PUBLIC_STRIPE_PRICE_ID` / `SYNC_SUBSCRIPTION_CLAIMS` /（mobile がある場合）`REVENUECAT_*` |

> `--external:stripe` を落とすとバンドルが壊れる。スクリプトが入れるので手で消さないこと。

## 2. 判断が要る部分

ここから先は**プロダクトと外部サービスの設定**で、スクリプトでは決められない。
手順の詳細は `.claude/docs/billing.md` にあるので、それを読みながら進める。

### 2-1. 何で売るかを決める

| 売り方 | 使うもの |
| --- | --- |
| Web だけ | Stripe（`REVENUECAT_*` は空でよい） |
| アプリ内課金だけ | RevenueCat（`STRIPE_*` は空でよい。mobile 層が前提） |
| 両方 | 両方。同じ `users/{uid}.subscription` に集約される |

未設定側のエンドポイントはエラーを返すので、片方だけでも動く
（Stripe は 503、RevenueCat Webhook は 500）。

### 2-2. 外部サービス側の設定（`.claude/docs/billing.md`）

- **Stripe**: アカウント作成 → 商品と price の作成 → Webhook エンドポイントの登録
  （`https://<Functions のURL>/webhooks/stripe`）→ 署名シークレットの取得。
  テストモードと本番モードで price ID もキーも別物になる
- **RevenueCat**: ストア（App Store Connect / Google Play）側の商品登録 → RevenueCat の
  プロジェクト作成 → Webhook の Authorization ヘッダー値の設定

### 2-3. 環境変数

`.env.<環境名>` に入れて `yarn env:<環境名>` で配布する。特に:

- `STRIPE_PRICE_IDS` — **購入を許可する price の許可リスト**。ここに無い price はサーバーが拒否する
- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` / `STRIPE_PORTAL_RETURN_URL` — 戻り先を
  サーバー側で固定する（オープンリダイレクト防止）
- `SYNC_SUBSCRIPTION_CLAIMS` — セキュリティルールから
  `request.auth.token.subscriptionActive` を使う場合のみ `true`

> `yarn env:<環境名>` は production 以外に本番キー（`sk_live_`）が入っていると停止する。
> 開発中の操作が実際のカードに課金されるのを防ぐためのガードなので、迂回しないこと。

### 2-4. 権利変化フック（プロダクト固有）

`apps/functions/src/lib/entitlement-hooks.ts` の `onSubscriptionUpgraded` /
`onSubscriptionDowngraded` に、**このプロダクトで何を解放 / 停止するか**を書く。
テンプレートの雛形は空なので、ここは必ず実装する。

## 3. 確認

- [ ] `node scripts/check-layers.mjs` が通る
- [ ] `yarn type-check` / `yarn lint` / `yarn test` が通る
- [ ] Stripe CLI で Webhook を転送し、テストカードで購入 → `users/{uid}.subscription` が更新される
      （`.claude/docs/billing.md`「ローカルで動作確認する」）
- [ ] 解約・期限切れで権利が落ちる（Test Clock で時間を進めて確認する）
- [ ] IAP を使う構成では `REVENUECAT_ALLOW_SANDBOX=true` を develop の `.env` に入れた
      （既定では Sandbox のイベントを適用しないため、TestFlight / 内部テストで購入しても
      反映されない。→ `.claude/docs/billing.md`）
- [ ] `entitlement-hooks.ts` にプロダクト固有の処理を書いた
- [ ] 本番の price ID とキーを production の環境変数にだけ入れた

import { createBilling, type Billing } from '@geckou/billing'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import Stripe from 'stripe'

import {
  onSubscriptionDowngraded,
  onSubscriptionUpgraded,
} from './entitlement-hooks'

/**
 * @geckou/billing の配線。
 *
 * ロジックはパッケージ側にあり、このファイルは環境変数と
 * firebase-admin のインスタンスを注入するだけ。
 * 権利変化フック（entitlement-hooks.ts）はこのプロジェクトで編集する。
 */

/**
 * 購入を許可する price ID の一覧。
 * クライアントから任意の price を渡されないよう、サーバー側で許可リストを持つ
 */
function getAllowedPriceIds(): string[] {
  return (process.env.STRIPE_PRICE_IDS ?? '')
    .split(',')
    .map((priceId) => priceId.trim())
    .filter((priceId) => priceId !== '')
}

let cached: Billing | null = null
let cachedStripeKey: string | null = null

export function getBilling(): Billing {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? ''

  // 環境変数が差し替わった場合（主にテスト）に備えてキーの変化を見る
  if (cached && cachedStripeKey === secretKey) return cached

  cached = createBilling({
    firestore: getFirestore(),
    auth: getAuth(),
    // Web 決済（Stripe）を使わないプロジェクトでは STRIPE_SECRET_KEY 未設定のまま
    // でよい（/billing/* は 503、Stripe Webhook は 500 を返す）
    stripe: secretKey
      ? {
          client: new Stripe(secretKey),
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
          allowedPriceIds: getAllowedPriceIds(),
          successUrl: process.env.STRIPE_SUCCESS_URL,
          cancelUrl: process.env.STRIPE_CANCEL_URL,
          portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL,
        }
      : undefined,
    revenuecat: process.env.REVENUECAT_WEBHOOK_AUTH
      ? { webhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH }
      : undefined,
    syncClaims: process.env.SYNC_SUBSCRIPTION_CLAIMS === 'true',
    onSubscriptionUpgraded,
    onSubscriptionDowngraded,
  })
  cachedStripeKey = secretKey

  return cached
}

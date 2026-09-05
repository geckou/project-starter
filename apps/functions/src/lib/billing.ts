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

/** getBilling が参照する env 一式。テストでの差し替えをキャッシュ無効化で拾う */
const BILLING_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_IDS',
  'STRIPE_SUCCESS_URL',
  'STRIPE_CANCEL_URL',
  'STRIPE_PORTAL_RETURN_URL',
  'REVENUECAT_WEBHOOK_AUTH',
  'REVENUECAT_ALLOW_SANDBOX',
  'SYNC_SUBSCRIPTION_CLAIMS',
] as const

function currentEnvKey(): string {
  return BILLING_ENV_KEYS.map((key) => process.env[key] ?? '').join('\u0000')
}

let cached: Billing | null = null
let cachedEnvKey: string | null = null

export function getBilling(): Billing {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? ''
  const envKey = currentEnvKey()

  // 環境変数が差し替わった場合（主にテスト）に備えて変化を見る
  if (cached && cachedEnvKey === envKey) return cached

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
      ? {
          webhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH,
          // Sandbox（TestFlight / 内部テストトラック）の購入は既定で無視される。
          // develop 環境だけ true にしないと、IAP の検証手順が「反映されない」で止まる
          allowSandbox: process.env.REVENUECAT_ALLOW_SANDBOX === 'true',
        }
      : undefined,
    syncClaims: process.env.SYNC_SUBSCRIPTION_CLAIMS === 'true',
    onSubscriptionUpgraded,
    onSubscriptionDowngraded,
  })
  cachedEnvKey = envKey

  return cached
}

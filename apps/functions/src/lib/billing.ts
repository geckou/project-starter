import { createBilling, type Billing } from '@geckou/billing'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'

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
 * 秘密は Secret Manager から取る。
 *
 * `.env` に書いた値は関数の環境変数としてデプロイされ、Cloud Console や
 * `gcloud functions describe` から閲覧者ロールでも読める。決済キーと Webhook の
 * 署名シークレットは、それが漏れた時点で任意の課金操作と偽イベントの注入を許す。
 *
 * 値は `firebase functions:secrets:set <名前>` で登録し、ここで宣言したものを
 * api.ts の `onRequest({ secrets })` に渡すことで、その関数だけにマウントされる
 * （→ `.claude/docs/billing.md`）。エミュレーターでは `apps/functions/.secret.local`
 * を読む。
 */
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')
const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH')

/**
 * この配線が使うシークレット一式。
 * `onRequest({ secrets: BILLING_SECRETS })` に渡した関数だけが値を読める。
 *
 * ⚠️ 宣言した秘密はデプロイ時に Secret Manager 側で解決されるため、
 * **3 つとも存在していないと非対話デプロイ（CI）が落ちる。**
 * Stripe だけ / IAP だけの構成でも、使わない側はダミー値で作っておく
 * （値が空文字なら下の配線は無効のまま動く。→ `.claude/docs/billing.md`）
 */
export const BILLING_SECRETS = [
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  REVENUECAT_WEBHOOK_AUTH,
]

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

/** キャッシュキーの区切り。値に現れない文字を使う（NUL） */
const ENV_KEY_SEPARATOR = String.fromCharCode(0)

function currentEnvKey(): string {
  return BILLING_ENV_KEYS.map((key) => process.env[key] ?? '').join(
    ENV_KEY_SEPARATOR
  )
}

let cached: Billing | null = null
let cachedEnvKey: string | null = null

/**
 * 課金の配線を返す。リクエスト時に呼ぶこと。
 *
 * async なのは `stripe` SDK を動的 import するため。モジュールの先頭で import すると
 * index.ts → api.ts の連鎖でスケジュール関数・トリガーまで含む全関数の
 * コールドスタートに乗る（esbuild の `--external:stripe` により実ロードされる）。
 * Stripe を使わない構成では一度も使われないコストになる。
 */
export async function getBilling(): Promise<Billing> {
  const envKey = currentEnvKey()

  // 環境変数が差し替わった場合（主にテスト）に備えて変化を見る
  if (cached && cachedEnvKey === envKey) return cached

  // .value() は未設定のとき警告を出す。キャッシュ判定より前に読むと、
  // このキーだけ警告の回数が他の 2 つと揃わない
  const secretKey = STRIPE_SECRET_KEY.value()

  // Web 決済（Stripe）を使わないプロジェクトでは STRIPE_SECRET_KEY 未設定のまま
  // でよい（/billing/* は 503、Stripe Webhook は 500 を返す）
  const stripe = secretKey
    ? {
        client: new (await import('stripe')).default(secretKey),
        webhookSecret: STRIPE_WEBHOOK_SECRET.value(),
        allowedPriceIds: getAllowedPriceIds(),
        successUrl: process.env.STRIPE_SUCCESS_URL,
        cancelUrl: process.env.STRIPE_CANCEL_URL,
        portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL,
      }
    : undefined

  const revenuecatAuth = REVENUECAT_WEBHOOK_AUTH.value()

  cached = createBilling({
    firestore: getFirestore(),
    auth: getAuth(),
    stripe,
    revenuecat: revenuecatAuth
      ? {
          webhookAuth: revenuecatAuth,
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

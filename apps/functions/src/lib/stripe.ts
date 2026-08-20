import Stripe from 'stripe'

let client: Stripe | null = null
let clientSecretKey: string | null = null

/**
 * Stripe クライアントを取得する。
 * STRIPE_SECRET_KEY が未設定なら null を返す（Web 決済を使わないプロジェクト向け）。
 */
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null

  // 環境変数が差し替わった場合（主にテスト）に備えてキーの変化を見る
  if (!client || clientSecretKey !== secretKey) {
    client = new Stripe(secretKey)
    clientSecretKey = secretKey
  }

  return client
}

/** Web 決済（Stripe）が有効かどうか */
export function isStripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * 購入を許可する price ID の一覧。
 * クライアントから任意の price を渡されないよう、サーバー側で許可リストを持つ。
 */
export function getAllowedPriceIds(): string[] {
  return (process.env.STRIPE_PRICE_IDS ?? '')
    .split(',')
    .map((priceId) => priceId.trim())
    .filter((priceId) => priceId !== '')
}

/**
 * Stripe のサブスクリプションステータスを、このプロジェクト共通の
 * SubscriptionStatus に変換する。
 *
 * Stripe の綴りは 'canceled'（l が1つ）である点に注意。
 */
export function mapStripeStatus(
  status: Stripe.Subscription.Status
): 'active' | 'in_grace_period' | 'cancelled' | 'expired' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'

    // 支払い失敗中。Stripe のリトライが続いている猶予期間
    case 'past_due':
    case 'unpaid':
      return 'in_grace_period'

    case 'canceled':
      return 'cancelled'

    // 初回決済が完了しなかった / 一時停止
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'expired'

    // Stripe.Subscription.Status は将来値のための OtherString を含むため
    // 網羅できない。未知のステータスは失効扱いにする
    // （誤って権利を与えるより、与えないほうが被害が小さい）
    default:
      console.warn(`Unknown Stripe subscription status: ${status}`)
      return 'expired'
  }
}

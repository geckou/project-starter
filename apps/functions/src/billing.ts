import { type Response } from 'express'
import { getAuth } from 'firebase-admin/auth'

import { type AuthenticatedRequest } from './lib/auth-middleware'
import { getAllowedPriceIds, getStripe } from './lib/stripe'
import { getStripeCustomerId, saveStripeCustomerId } from './lib/subscription'

/**
 * uid に対応する Stripe 顧客を取得する。無ければ作成して保存する。
 * metadata.uid を入れておくと Stripe ダッシュボードから逆引きできる。
 */
async function findOrCreateCustomer(uid: string): Promise<string> {
  const existing = await getStripeCustomerId(uid)
  if (existing) return existing

  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe not configured')

  // メールは Stripe 側の顧客一覧を見やすくするためだけに使う（取得失敗は致命的でない）
  let email: string | undefined
  try {
    email = (await getAuth().getUser(uid)).email
  } catch {
    email = undefined
  }

  const customer = await stripe.customers.create({ email, metadata: { uid } })
  await saveStripeCustomerId(uid, customer.id)

  return customer.id
}

/**
 * POST /billing/checkout
 * Stripe Checkout のセッションを作成し、リダイレクト先 URL を返す。
 */
export async function handleCreateCheckoutSession(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const stripe = getStripe()
  if (!stripe) {
    res.status(503).json({ error: 'Stripe not configured' })
    return
  }

  const successUrl = process.env.STRIPE_SUCCESS_URL
  const cancelUrl = process.env.STRIPE_CANCEL_URL
  if (!successUrl || !cancelUrl) {
    console.error('STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL not configured')
    res.status(500).json({ error: 'Checkout URLs not configured' })
    return
  }

  // 任意の price を購入されないよう、サーバー側の許可リストで検証する
  const allowedPriceIds = getAllowedPriceIds()
  const priceId = (req.body as { priceId?: unknown })?.priceId

  if (typeof priceId !== 'string' || !allowedPriceIds.includes(priceId)) {
    res.status(400).json({ error: 'Invalid priceId' })
    return
  }

  try {
    const customerId = await findOrCreateCustomer(req.uid)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Webhook 側で誰の購入か特定するために uid を両方へ入れる
      client_reference_id: req.uid,
      metadata: { uid: req.uid },
      subscription_data: { metadata: { uid: req.uid } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    if (!session.url) {
      res.status(500).json({ error: 'Checkout session has no URL' })
      return
    }

    res.json({ url: session.url })
  } catch (error) {
    console.error('Failed to create checkout session', error)
    res.status(500).json({ error: 'Internal error' })
  }
}

/**
 * POST /billing/portal
 * Stripe カスタマーポータル（解約・プラン変更・支払い方法の更新）の URL を返す。
 */
export async function handleCreatePortalSession(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const stripe = getStripe()
  if (!stripe) {
    res.status(503).json({ error: 'Stripe not configured' })
    return
  }

  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL
  if (!returnUrl) {
    console.error('STRIPE_PORTAL_RETURN_URL not configured')
    res.status(500).json({ error: 'Portal return URL not configured' })
    return
  }

  try {
    const customerId = await getStripeCustomerId(req.uid)

    // 一度も Stripe で購入していないユーザーにはポータルが存在しない
    if (!customerId) {
      res.status(404).json({ error: 'No Stripe customer for this user' })
      return
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })

    res.json({ url: session.url })
  } catch (error) {
    console.error('Failed to create portal session', error)
    res.status(500).json({ error: 'Internal error' })
  }
}

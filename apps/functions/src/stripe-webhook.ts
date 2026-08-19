import { type Request, type Response } from 'express'
import type Stripe from 'stripe'

import { getStripe, mapStripeStatus } from './lib/stripe'
import {
  applySubscriptionEvent,
  saveStripeCustomerId,
} from './lib/subscription'

/**
 * Stripe のサブスクリプション期間終了日時を取り出す。
 *
 * API version 2025-03-31.basil 以降、current_period_end は Subscription 直下から
 * subscription item 側へ移動した。どちらの形でも動くように両方を見る。
 */
function extractCurrentPeriodEnd(
  subscription: Stripe.Subscription
): Date | undefined {
  const fromItem = subscription.items?.data?.[0]?.current_period_end
  const fromSubscription = (
    subscription as unknown as { current_period_end?: number }
  ).current_period_end
  const seconds = fromItem ?? fromSubscription

  return typeof seconds === 'number' ? new Date(seconds * 1000) : undefined
}

/** Checkout Session 作成時に metadata へ入れた Firebase uid を取り出す */
function extractUid(subscription: Stripe.Subscription): string | undefined {
  const uid = subscription.metadata?.uid

  return typeof uid === 'string' && uid !== '' ? uid : undefined
}

export async function handleStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const stripe = getStripe()
  if (!stripe) {
    console.error('STRIPE_SECRET_KEY not configured')
    res.status(500).json({ error: 'Stripe not configured' })
    return
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    res.status(500).json({ error: 'Webhook secret not configured' })
    return
  }

  const signature = req.headers['stripe-signature']
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing stripe-signature header' })
    return
  }

  // 署名検証には生のリクエストボディが必要。
  // api.ts で express.json() より前に express.raw() を通している
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      webhookSecret
    )
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error)
    res.status(400).json({ error: 'Invalid signature' })
    return
  }

  const occurredAt = new Date(event.created * 1000)

  try {
    switch (event.type) {
      // 決済完了。以降 顧客ポータルを開けるよう顧客 ID を保存する
      case 'checkout.session.completed': {
        const session = event.data.object
        const uid = session.client_reference_id ?? session.metadata?.uid
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id

        if (uid && customerId) {
          await saveStripeCustomerId(uid, customerId)
        } else {
          console.warn(
            `checkout.session.completed without uid or customer: ${session.id}`
          )
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const uid = extractUid(subscription)

        if (!uid) {
          // uid が無いと誰の権利か特定できない。Stripe には 200 を返して再送を止め、
          // ログで検知できるようにする（Checkout 作成時の metadata 設定漏れ）
          console.error(
            `Stripe subscription without uid metadata: ${subscription.id}`
          )
          break
        }

        // 削除イベントは Stripe 側の status に関わらず失効として扱う
        const status =
          event.type === 'customer.subscription.deleted'
            ? 'expired'
            : mapStripeStatus(subscription.status)

        const result = await applySubscriptionEvent({
          eventId: event.id,
          source: 'stripe',
          uid,
          occurredAt,
          subscription: {
            status,
            source: 'stripe',
            planId: subscription.items?.data?.[0]?.price?.id,
            currentPeriodEnd: extractCurrentPeriodEnd(subscription),
            cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
          },
        })

        if (result.status !== 'applied') {
          console.log(`Stripe event ${event.id} skipped: ${result.status}`)
        }
        break
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`)
    }
  } catch (error) {
    console.error('Failed to process Stripe webhook', error)
    res.status(500).json({ error: 'Internal error' })
    return
  }

  res.status(200).json({ received: true })
}

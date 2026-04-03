import crypto from 'crypto'
import { type Request, type Response } from 'express'
import { getFirestore } from 'firebase-admin/firestore'

type WebhookEvent = {
  event: {
    type: string
    app_user_id: string
    timestamp: number
  }
}

function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64')
  return hash === signature
}

export async function handleRevenueCatWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (!secret) {
    console.error('REVENUECAT_WEBHOOK_SECRET not configured')
    res.status(500).json({ error: 'Webhook secret not configured' })
    return
  }

  // raw body（Buffer）を文字列化して署名検証
  const rawBody =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : JSON.stringify(req.body)

  const signature = req.headers['x-revenuecat-signature'] as string
  if (!verifySignature(rawBody, signature, secret)) {
    console.error('Invalid RevenueCat webhook signature')
    res.status(401).json({ error: 'Invalid signature' })
    return
  }

  const parsed: WebhookEvent =
    typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(rawBody)
      : req.body
  const { type, app_user_id: userId } = parsed.event
  const db = getFirestore()
  const now = new Date()

  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      await db.collection('users').doc(userId).update({
        'subscription.status': 'active',
        'subscription.updatedAt': now,
      })
      break

    case 'CANCELLATION':
      await db.collection('users').doc(userId).update({
        'subscription.status': 'cancelled',
        'subscription.cancelledAt': now,
      })
      break

    case 'EXPIRATION':
      await db.collection('users').doc(userId).update({
        'subscription.status': 'expired',
        'subscription.expiredAt': now,
      })
      break

    default:
      console.log(`Unhandled RevenueCat event: ${type}`)
  }

  res.status(200).json({ received: true })
}

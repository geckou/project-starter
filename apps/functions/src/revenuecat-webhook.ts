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

// RevenueCat の Webhook は HMAC 署名ではなく、Dashboard で設定した
// Authorization ヘッダー値をそのまま送信する方式。
// タイミング攻撃を避けるため timingSafeEqual で比較する
function verifyAuthorization(
  header: string | undefined,
  expected: string
): boolean {
  if (!header) return false

  const received = Buffer.from(header)
  const secret = Buffer.from(expected)

  if (received.length !== secret.length) return false

  return crypto.timingSafeEqual(received, secret)
}

export async function handleRevenueCatWebhook(
  req: Request,
  res: Response
): Promise<void> {
  // RevenueCat Dashboard > Integrations > Webhooks > Authorization header value
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH
  if (!expected) {
    console.error('REVENUECAT_WEBHOOK_AUTH not configured')
    res.status(500).json({ error: 'Webhook auth not configured' })
    return
  }

  if (!verifyAuthorization(req.headers.authorization, expected)) {
    console.error('Invalid RevenueCat webhook authorization')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed: WebhookEvent =
    typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString('utf-8'))
      : req.body
  const { type, app_user_id: userId } = parsed.event
  const db = getFirestore()
  const now = new Date()

  // set + merge を使う（update はドキュメント未作成時に throw するため）
  const setSubscription = (fields: Record<string, unknown>) =>
    db
      .collection('users')
      .doc(userId)
      .set({ subscription: fields }, { merge: true })

  try {
    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
        await setSubscription({ status: 'active', updatedAt: now })
        break

      case 'CANCELLATION':
        await setSubscription({ status: 'cancelled', cancelledAt: now })
        break

      case 'EXPIRATION':
        await setSubscription({ status: 'expired', expiredAt: now })
        break

      default:
        console.log(`Unhandled RevenueCat event: ${type}`)
    }
  } catch (error) {
    console.error('Failed to process RevenueCat webhook', error)
    res.status(500).json({ error: 'Internal error' })
    return
  }

  res.status(200).json({ received: true })
}

import crypto from 'crypto'
import type { SubscriptionStatus } from '@geckou/shared'
import { type Request, type Response } from 'express'

import { applySubscriptionEvent } from './lib/subscription'

// 外部入力なので、型はあくまで想定される形。実際の値は実行時に検証する
type WebhookEvent = {
  event: {
    // 古い RevenueCat の設定では id が来ないことがある
    id?: string
    type: string
    app_user_id: string
    event_timestamp_ms?: number
    expiration_at_ms?: number
    entitlement_ids?: string[]
  }
}

/** 有限な数値のみ受け取る（NaN・文字列・undefined は null にする） */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 冪等性キーを決める。
 *
 * id が無い場合に「種別 + ユーザー + 時刻」のような組み立てキーを使うと、
 * 時刻まで欠けたときに別イベントが同じキーへ衝突し、2件目以降が
 * duplicate として捨てられてしまう。ペイロード全体のハッシュなら
 * 再送では同じ値、別イベントでは別の値になる。
 */
function buildEventId(event: WebhookEvent['event']): string {
  if (typeof event.id === 'string' && event.id !== '') return event.id

  return crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex')
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

/**
 * RevenueCat のイベント種別を共通の SubscriptionStatus に変換する。
 * null を返した種別は権利状態を変えない（ログのみ）。
 */
function mapRevenueCatStatus(type: string): SubscriptionStatus | null {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'NON_RENEWING_PURCHASE':
      return 'active'

    // 自動更新を止めただけ。expiration_at_ms までは利用できる
    case 'CANCELLATION':
    case 'SUBSCRIPTION_PAUSED':
      return 'cancelled'

    // 支払い失敗。ストアのリトライが続いている猶予期間
    case 'BILLING_ISSUE':
      return 'in_grace_period'

    case 'EXPIRATION':
      return 'expired'

    default:
      return null
  }
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

  // 外部入力のため、パース失敗・想定外の形は 400 で返す
  let parsed: WebhookEvent
  try {
    parsed =
      typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString('utf-8'))
        : req.body
  } catch {
    res.status(400).json({ error: 'Invalid JSON' })
    return
  }

  const event = parsed?.event
  if (
    typeof event?.type !== 'string' ||
    typeof event?.app_user_id !== 'string' ||
    event.app_user_id === ''
  ) {
    res.status(400).json({ error: 'Invalid payload' })
    return
  }

  const status = mapRevenueCatStatus(event.type)
  if (!status) {
    console.log(`Unhandled RevenueCat event: ${event.type}`)
    res.status(200).json({ received: true })
    return
  }

  const eventId = buildEventId(event)
  const occurredAtMs = asFiniteNumber(event.event_timestamp_ms)
  const expirationMs = asFiniteNumber(event.expiration_at_ms)
  const planId = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids.find((id) => typeof id === 'string')
    : undefined

  try {
    const result = await applySubscriptionEvent({
      eventId,
      source: 'revenuecat',
      uid: event.app_user_id,
      // 時刻が無ければ受信時刻で代用する（順序制御の基準として使う）
      occurredAt: occurredAtMs !== null ? new Date(occurredAtMs) : new Date(),
      subscription: {
        status,
        source: 'revenuecat',
        planId,
        currentPeriodEnd:
          expirationMs !== null ? new Date(expirationMs) : undefined,
        cancelAtPeriodEnd: status === 'cancelled',
      },
    })

    if (result.status !== 'applied') {
      console.log(`RevenueCat event ${eventId} skipped: ${result.status}`)
    }
  } catch (error) {
    console.error('Failed to process RevenueCat webhook', error)
    res.status(500).json({ error: 'Internal error' })
    return
  }

  res.status(200).json({ received: true })
}

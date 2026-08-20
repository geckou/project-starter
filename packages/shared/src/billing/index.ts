import type { Subscription } from '../types'

// Firestore から読み出した日時は Timestamp 型になるため、
// Date と Timestamp（toDate を持つオブジェクト）の両方を受け付ける
type DateLike = Date | { toDate: () => Date }

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value

  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate()
  }

  return null
}

/**
 * サブスクリプションが今この瞬間に有効かを判定する。
 *
 * status === 'cancelled' は「自動更新が止まっている」だけで、
 * 課金期間の終了日時までは利用できる点に注意（Stripe / RevenueCat 共通の挙動）。
 */
export function isSubscriptionActive(
  subscription: Subscription | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscription) return false

  switch (subscription.status) {
    case 'active':
    case 'in_grace_period':
      return true

    case 'cancelled': {
      const periodEnd = toDate(subscription.currentPeriodEnd as DateLike)
      return periodEnd !== null && periodEnd.getTime() > now.getTime()
    }

    case 'expired':
      return false
  }
}

/**
 * 指定したプランの権利を持っているかを判定する。
 * planId を使わない（単一プランの）プロダクトでは isSubscriptionActive だけでよい。
 */
export function hasPlan(
  subscription: Subscription | null | undefined,
  planId: string,
  now: Date = new Date()
): boolean {
  if (!isSubscriptionActive(subscription, now)) return false

  return subscription?.planId === planId
}

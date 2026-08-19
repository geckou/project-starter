/** ユーザー */
export type User = {
  id: string
  displayName: string
  email: string
  subscription?: Subscription
  /** Stripe の顧客 ID。Web 決済を使う場合のみ設定される（サーバーのみ書き込み可） */
  stripeCustomerId?: string
  createdAt: Date
}

/**
 * サブスクリプションの権利状態。
 *
 * Web 決済（Stripe）とアプリ内課金（RevenueCat 経由の IAP）の
 * どちらで購入されても、この単一の形に集約する。
 *
 * - active          有効
 * - in_grace_period 支払いに失敗したが猶予期間中（まだ利用可）
 * - cancelled       自動更新が止まっている（currentPeriodEnd までは利用可）
 * - expired         失効（利用不可）
 */
export type SubscriptionStatus =
  'active' | 'in_grace_period' | 'cancelled' | 'expired'

/** 購入経路 */
export type SubscriptionSource = 'stripe' | 'revenuecat'

export type Subscription = {
  status: SubscriptionStatus
  /** どの経路で購入されたか */
  source: SubscriptionSource
  /** プラン識別子（Stripe は price ID、RevenueCat は entitlement ID） */
  planId?: string
  /** 現在の課金期間の終了日時。cancelled でもこの日時までは利用可 */
  currentPeriodEnd?: Date
  /** 期間終了時に解約されるか */
  cancelAtPeriodEnd?: boolean
  updatedAt: Date
  /** 冪等性・順序制御用（Webhook が書き込む） */
  lastEventId?: string
  lastEventAt?: Date
}

/** API レスポンスの共通型 */
export type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
}

/** ユーザー */
export type User = {
  id: string
  displayName: string
  email: string
  subscription?: Subscription
  createdAt: Date
}

/** サブスクリプション */
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired'

export type Subscription = {
  status: SubscriptionStatus
  updatedAt?: Date
  cancelledAt?: Date
  expiredAt?: Date
}

/** API レスポンスの共通型 */
export type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
}
